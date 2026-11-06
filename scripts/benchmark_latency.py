"""
Latency benchmark for the Query Labs orchestrator — covers all three improvement tiers.

Usage (services must be running):
    cd querylab
    orchestrator/.venv/Scripts/python.exe scripts/benchmark_latency.py

Optional env overrides:
    BENCH_BASE_URL   orchestrator base URL  (default http://localhost:8082)
    BENCH_QUERY      query text for /query/stream tests
    BENCH_SOURCE     data source / collection name
    BENCH_REPS       repeat count per test   (default 8)

What is measured and why
────────────────────────
  /api/agent_names   (GET)  → agent-card TTL cache (Tier 1 Step 1)
                              First call hits HTTP; subsequent calls served from memory.
  /api/data_sources  (GET)  → same cache, different route
  /api/v3/query/stream (POST SSE)
                            → full pipeline: card cache + httpx singleton (Tier 1)
                              + Weaviate embed/result cache (Tier 2)
                              + discovery cache (Tier 3)
                              + parallel chart + follow-up (Tier 1 Step 3)

Output shows:
  cold  = first request  (cache unpopulated)
  warm  = subsequent requests (cache populated)
  ratio = cold / warm    (>1 means the cache helps)
  P50 / P95 over BENCH_REPS warm calls
"""

import asyncio
import json
import os
import statistics
import time
from typing import List, Optional

import httpx

BASE_URL = os.environ.get("BENCH_BASE_URL", "http://localhost:8082").rstrip("/")
QUERY = os.environ.get("BENCH_QUERY", "What are the top revenue trends this quarter?")
SOURCE = os.environ.get("BENCH_SOURCE", "")
REPS = int(os.environ.get("BENCH_REPS", "8"))

# ── helpers ───────────────────────────────────────────────────────────────────

def _pct(data: List[float], p: int) -> float:
    if not data:
        return 0.0
    idx = max(0, int(len(data) * p / 100) - 1)
    return sorted(data)[idx]


def _bar(ratio: float, width: int = 20) -> str:
    filled = min(width, int(ratio * width / 5))  # scale: 5x = full bar
    return "█" * filled + "░" * (width - filled)


def _print_result(label: str, cold_ms: float, warm_ms: List[float]) -> None:
    p50 = _pct(warm_ms, 50)
    p95 = _pct(warm_ms, 95)
    ratio = cold_ms / p50 if p50 > 0 else 1.0
    print(f"\n  {label}")
    print(f"    cold (1st req) : {cold_ms:>8.1f} ms")
    print(f"    warm P50       : {p50:>8.1f} ms   {_bar(ratio)}")
    print(f"    warm P95       : {p95:>8.1f} ms")
    print(f"    speedup        : {ratio:>8.1f}×")


# ── benchmark targets ─────────────────────────────────────────────────────────

async def bench_get(client: httpx.AsyncClient, path: str, reps: int):
    """Benchmark a simple GET endpoint."""
    url = f"{BASE_URL}{path}"
    # cold
    t0 = time.monotonic()
    r = await client.get(url)
    cold_ms = (time.monotonic() - t0) * 1000
    if r.status_code not in (200, 204):
        print(f"    ⚠  {path} → HTTP {r.status_code} (skipping)")
        return None, []

    # warm
    warm_ms = []
    for _ in range(reps):
        t0 = time.monotonic()
        await client.get(url)
        warm_ms.append((time.monotonic() - t0) * 1000)

    return cold_ms, warm_ms


async def bench_stream(client: httpx.AsyncClient, reps: int):
    """Benchmark the SSE stream endpoint — measures time to final 'done' event."""
    url = f"{BASE_URL}/api/v3/query/stream"
    payload = {"query": QUERY}
    if SOURCE:
        payload["data_source"] = SOURCE

    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}

    async def _one_stream() -> Optional[float]:
        t0 = time.monotonic()
        try:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    return None
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        try:
                            evt = json.loads(line[5:].strip())
                            if evt.get("type") in ("done", "error"):
                                break
                        except json.JSONDecodeError:
                            pass
        except Exception:
            return None
        return (time.monotonic() - t0) * 1000

    # cold
    cold_ms = await _one_stream()
    if cold_ms is None:
        print("    ⚠  /query/stream unreachable or returned error (skipping)")
        return None, []

    # warm
    warm_ms = []
    for _ in range(reps):
        ms = await _one_stream()
        if ms is not None:
            warm_ms.append(ms)

    return cold_ms, warm_ms


# ── additional micro-benchmarks ───────────────────────────────────────────────

async def bench_embed_cache(client: httpx.AsyncClient):
    """
    Indirectly probe the embedding cache by sending the same query twice
    to the Weaviate MCP server's health endpoint (if exposed), or measuring
    the difference in /query/stream latency for identical vs novel queries.
    """
    url = f"{BASE_URL}/api/v3/query/stream"
    payload = {"query": QUERY}
    if SOURCE:
        payload["data_source"] = SOURCE
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}

    async def _stream_ms() -> Optional[float]:
        t0 = time.monotonic()
        try:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    return None
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        try:
                            evt = json.loads(line[5:].strip())
                            if evt.get("type") in ("done", "error"):
                                break
                        except json.JSONDecodeError:
                            pass
        except Exception:
            return None
        return (time.monotonic() - t0) * 1000

    # Send SAME query 3× — 2nd and 3rd benefit from Weaviate embed + result cache
    results = []
    for i in range(3):
        ms = await _stream_ms()
        if ms is not None:
            results.append(ms)

    return results


# ── main ──────────────────────────────────────────────────────────────────────

async def main():
    print("=" * 60)
    print(" Query Labs Orchestrator — Latency Benchmark")
    print(f" target : {BASE_URL}")
    print(f" query  : {QUERY[:60]}...")
    print(f" reps   : {REPS} warm calls per test")
    print("=" * 60)

    timeout = httpx.Timeout(connect=5.0, read=180.0, write=10.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:

        # ── check service is up ───────────────────────────────────────────────
        try:
            r = await client.get(f"{BASE_URL}/health")
            if r.status_code != 200:
                print(f"\n✗ Health check failed (HTTP {r.status_code}). Is the orchestrator running?")
                return
        except httpx.ConnectError:
            print(f"\n✗ Cannot connect to {BASE_URL}. Start the orchestrator first.")
            return
        print(f"\n✓ Service is up ({BASE_URL}/health → 200)")

        # ── Tier 1 Step 1: agent card cache ───────────────────────────────────
        print("\n── Tier 1 — Agent Card Cache (/api/agent_names) ─────────────")
        cold, warm = await bench_get(client, "/api/agent_names", REPS)
        if cold is not None:
            _print_result("/api/agent_names", cold, warm)

        cold, warm = await bench_get(client, "/api/data_sources", REPS)
        if cold is not None:
            _print_result("/api/data_sources", cold, warm)

        # ── Tier 1 Step 2: httpx singleton — measured via overall stream ──────
        print("\n── Tier 1–3 — Full Pipeline (/api/v3/query/stream) ──────────")
        cold, warm = await bench_stream(client, REPS)
        if cold is not None:
            _print_result("first query (cold caches)", cold, warm)

        # ── Tier 2: embed + result cache — same query repeated ────────────────
        print("\n── Tier 2 — Weaviate Cache (same query ×3) ──────────────────")
        triple = await bench_embed_cache(client)
        if len(triple) >= 2:
            labels = ["1st (cold embed+result)", "2nd (warm embed+result)", "3rd (all caches)"]
            for i, ms in enumerate(triple):
                label = labels[i] if i < len(labels) else f"call {i+1}"
                bar = "░" * 20
                if triple[0] > 0:
                    bar = _bar(triple[0] / ms)
                print(f"    {label:<30} {ms:>8.1f} ms  {bar}")
            if len(triple) >= 2 and triple[1] > 0:
                print(f"\n    cache speedup (call1 / call2): {triple[0]/triple[1]:.1f}×")

    print("\n" + "=" * 60)
    print(" Summary")
    print(" ─────────────────────────────────────────────────────")
    print(" • speedup > 1× on agent_names/data_sources → card cache working")
    print(" • stream call2 faster than call1 → Weaviate embed+result cache working")
    print(" • P95 close to P50 on warm calls → stable under cache hits")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
