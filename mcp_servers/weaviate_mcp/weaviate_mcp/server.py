"""
Weaviate MCP server: exposes retrieve_docs_from_collection tool.

Retrieves documents from a Weaviate collection via hybrid search (same pattern as backend_sql).
Creates query embeddings using OpenAI and passes them to Weaviate, allowing hybrid search
to work even when collection has no vectorizer configured.
Config via env: WEAVIATE_HOST, WEAVIATE_PORT, WEAVIATE_API_KEY, OPENAI_API_KEY.

Run as HTTP server (recommended; no cwd/path issues):
  poetry run python -m weaviate_mcp.server
  Uses MCP_HOST (default 0.0.0.0), MCP_PORT (default 8001). Connect at http://<host>:8001/mcp

Run stdio (optional): MCP_TRANSPORT=stdio poetry run python -m weaviate_mcp.server
Set MCP_LOG_LEVEL=DEBUG for verbose logging.

Performance env keys:
  WEAVIATE_EMBED_CACHE_TTL    seconds to cache embeddings (default 1800)
  WEAVIATE_EMBED_CACHE_MAX    max embedding cache entries (default 512)
  WEAVIATE_RESULT_CACHE_TTL   seconds to cache search results (default 300)
  WEAVIATE_RESULT_CACHE_MAX   max result cache entries (default 256)
  WEAVIATE_CONFIDENCE_RATIO   dynamic score threshold = max_score * ratio (default 0.5)
  WEAVIATE_CONFIDENCE_FLOOR   minimum threshold floor (default 0.15)
"""
import hashlib
import logging
import os
import threading
import time as _time
from collections import OrderedDict
from pathlib import Path

# Load .env from mcp_servers/weaviate_mcp or repo root (skip when DOCKER_RUNNING=true, env from compose)
def _load_env():
    if os.environ.get("DOCKER_RUNNING", "").strip().lower() in ("1", "true", "yes"):
        return
    try:
        from dotenv import load_dotenv
        root = Path(__file__).resolve().parent.parent
        for p in [root / ".env", root / ".env.local", Path.cwd() / ".env"]:
            if p.is_file():
                load_dotenv(p)
                break
    except ImportError:
        pass

_load_env()

def _configure_logging() -> None:
    level_name = os.environ.get("MCP_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    fmt = "[weaviate_mcp] %(levelname)s %(message)s"
    logging.basicConfig(level=level, format=fmt, force=True)

_configure_logging()
logger = logging.getLogger("weaviate_mcp")

from mcp.server.fastmcp import FastMCP

_host = os.environ.get("MCP_HOST", "0.0.0.0")
_port = int(os.environ.get("MCP_PORT", "8001"))
mcp = FastMCP("weaviate-mcp", host=_host, port=_port, stateless_http=True)

# ── Embedding cache (Step 4) ───────────────────────────────────────────────────
_EMBED_CACHE_TTL = int(os.getenv("WEAVIATE_EMBED_CACHE_TTL", "1800"))
_EMBED_CACHE_MAX = int(os.getenv("WEAVIATE_EMBED_CACHE_MAX", "512"))
_embed_cache: OrderedDict = OrderedDict()
_embed_lock = threading.Lock()

# ── Result cache (Step 5) ──────────────────────────────────────────────────────
_RESULT_CACHE_TTL = int(os.getenv("WEAVIATE_RESULT_CACHE_TTL", "300"))
_RESULT_CACHE_MAX = int(os.getenv("WEAVIATE_RESULT_CACHE_MAX", "256"))
_result_cache: OrderedDict = OrderedDict()
_result_lock = threading.Lock()

# ── Weaviate connection singleton (Step 6) ─────────────────────────────────────
_weaviate_client = None
_weaviate_lock = threading.Lock()

# ── Confidence filtering (Step 7) ─────────────────────────────────────────────
_CONFIDENCE_RATIO = float(os.getenv("WEAVIATE_CONFIDENCE_RATIO", "0.5"))
_CONFIDENCE_FLOOR = float(os.getenv("WEAVIATE_CONFIDENCE_FLOOR", "0.15"))


def _build_weaviate_client():
    """Build a fresh Weaviate client from env."""
    import weaviate
    from weaviate.classes.init import Auth

    host = os.environ.get("WEAVIATE_HOST", "localhost")
    port = int(os.environ.get("WEAVIATE_PORT", "8080"))
    api_key = os.environ.get("WEAVIATE_API_KEY", "")
    auth = Auth.api_key(api_key) if api_key else None
    if os.environ.get("WEAVIATE_URL"):
        client = weaviate.connect_to_weaviate(
            url=os.environ["WEAVIATE_URL"],
            auth_credentials=auth,
            skip_init_checks=True,
        )
    else:
        client = weaviate.connect_to_local(
            host=host,
            port=port,
            auth_credentials=auth,
            skip_init_checks=True,
        )

    try:
        collections = client.collections.list_all()
        collection_names = [coll.name for coll in collections.values()]
        logger.info(
            "Connected to Weaviate at %s:%s, found %d collections: %s",
            host, port, len(collection_names), collection_names,
        )
        for coll_name, coll_config in collections.items():
            vectorizer = getattr(coll_config.vectorizer_config, "vectorizer", "none")
            logger.debug("Collection '%s': vectorizer=%s", coll_name, vectorizer)
    except Exception as e:
        logger.warning("Could not retrieve collection details: %s", e)

    return client


def _get_weaviate_client():
    """Return the process-wide Weaviate client, reconnecting if the connection dropped."""
    global _weaviate_client
    with _weaviate_lock:
        if _weaviate_client is not None:
            try:
                if _weaviate_client.is_ready():
                    return _weaviate_client
            except Exception:
                pass
            try:
                _weaviate_client.close()
            except Exception:
                pass
            _weaviate_client = None
        _weaviate_client = _build_weaviate_client()
        return _weaviate_client


def _get_query_vector(query: str):
    """Return embedding for query, using TTL+LRU in-memory cache."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set - hybrid search will fail on collections without vectorizer")
        return None
    model = os.environ.get("WEAVIATE_EMBEDDING_MODEL", "text-embedding-3-small")
    cache_key = hashlib.md5(f"{model}:{query}".encode()).hexdigest()
    now = _time.monotonic()
    with _embed_lock:
        if cache_key in _embed_cache:
            vector, ts = _embed_cache[cache_key]
            if (now - ts) < _EMBED_CACHE_TTL:
                _embed_cache.move_to_end(cache_key)
                logger.debug("embed cache hit (key=%.8s)", cache_key)
                return vector
            del _embed_cache[cache_key]
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.embeddings.create(input=[query], model=model)
        vector = response.data[0].embedding
        logger.debug("Created query embedding (model=%s dim=%d)", model, len(vector))
        with _embed_lock:
            _embed_cache[cache_key] = (vector, _time.monotonic())
            _embed_cache.move_to_end(cache_key)
            while len(_embed_cache) > _EMBED_CACHE_MAX:
                _embed_cache.popitem(last=False)
        return vector
    except Exception as e:
        logger.error("Failed to create query embedding: %s", e)
        return None


def _retrieve_from_weaviate(
    query: str,
    collection_name: str,
    limit: int = 10,
    alpha: float = 0.75,
    min_score: float = 0.0,
) -> list[dict]:
    """
    Run hybrid search on Weaviate.
    Results are cached (WEAVIATE_RESULT_CACHE_TTL seconds).
    Dynamic confidence filtering removes low-relevance results unless overridden by min_score.
    """
    cache_key = hashlib.md5(
        f"{collection_name}:{query}:{limit}:{alpha}:{min_score}".encode()
    ).hexdigest()
    now = _time.monotonic()
    with _result_lock:
        if cache_key in _result_cache:
            results, ts = _result_cache[cache_key]
            if (now - ts) < _RESULT_CACHE_TTL:
                _result_cache.move_to_end(cache_key)
                logger.debug("result cache hit (key=%.8s)", cache_key)
                return results
            del _result_cache[cache_key]

    from weaviate.classes.query import MetadataQuery

    client = _get_weaviate_client()
    coll = client.collections.get(collection_name)
    query_vector = _get_query_vector(query)

    logger.debug("Using hybrid search with custom query embedding")
    response = coll.query.hybrid(
        query=query,
        vector=query_vector,
        limit=limit,
        alpha=alpha,
        return_metadata=MetadataQuery(score=True),
    )

    objects = getattr(response, "objects", response)
    if not hasattr(objects, "__iter__"):
        objects = []
    results = []
    for obj in objects:
        raw = getattr(obj, "properties", None)
        try:
            props = dict(raw) if raw else {}
        except (TypeError, ValueError):
            props = getattr(raw, "__dict__", {}) or {}
        content = (
            props.get("content")
            or props.get("markdown_content")
            or props.get("text")
            or str(props)
        )
        score = getattr(obj.metadata, "score", None)
        results.append({
            "content": content,
            "score": float(score) if score is not None else None,
            "properties": props,
        })

    # ── Dynamic confidence filtering (Step 7) ─────────────────────────────────
    scored = [r for r in results if r["score"] is not None]
    if scored:
        max_score = max(r["score"] for r in scored)
        dynamic_threshold = max(max_score * _CONFIDENCE_RATIO, _CONFIDENCE_FLOOR)
        threshold = max(dynamic_threshold, min_score)
        before = len(results)
        results = [r for r in results if r["score"] is None or r["score"] >= threshold]
        dropped = before - len(results)
        if dropped:
            logger.debug(
                "confidence filter: kept %d/%d (threshold=%.3f max=%.3f)",
                len(results), before, threshold, max_score,
            )

    with _result_lock:
        _result_cache[cache_key] = (results, _time.monotonic())
        _result_cache.move_to_end(cache_key)
        while len(_result_cache) > _RESULT_CACHE_MAX:
            _result_cache.popitem(last=False)

    return results


@mcp.tool()
def retrieve_docs_from_collection(
    query: str,
    collection_name: str,
    limit: int = 10,
    alpha: float = 0.75,
    min_score: float = 0.0,
) -> str:
    """
    Retrieve documents from a Weaviate collection using hybrid search.

    Use this tool when you need to search a vector collection by natural language.
    Returns the most relevant document contents and scores (same behavior as querylab_sql vector retrieval).

    Args:
        query: Natural language or keyword search query.
        collection_name: Name of the Weaviate collection (class) to search.
        limit: Maximum number of documents to return (default 10).
        alpha: Hybrid search balance — 1.0 = pure vector, 0.0 = pure BM25 (default 0.75).
        min_score: Minimum relevance score to include (0.0 = use dynamic threshold).

    Returns:
        A formatted string with each document's content and optional score.
    """
    logger.info(
        "retrieve_docs_from_collection called (collection=%r limit=%d alpha=%.2f min_score=%.2f)",
        collection_name, limit, alpha, min_score,
    )
    try:
        records = _retrieve_from_weaviate(
            query=query,
            collection_name=collection_name,
            limit=limit,
            alpha=alpha,
            min_score=min_score,
        )
    except Exception as e:
        logger.exception("retrieve_docs_from_collection failed: %s", e)
        return f"Error retrieving from Weaviate: {e}"
    if not records:
        logger.info("retrieve_docs_from_collection: no documents found")
        return "No documents found for that query."
    logger.info("retrieve_docs_from_collection success: %d documents", len(records))
    lines = []
    for i, r in enumerate(records, 1):
        score_str = f" (score: {r['score']:.4f})" if r.get("score") is not None else ""
        lines.append(f"[{i}]{score_str}\n{r['content']}")
    return "\n\n---\n\n".join(lines)


if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "streamable-http").strip().lower()
    if transport == "stdio":
        logger.info("Starting weaviate_mcp (transport=stdio)")
        mcp.run(transport="stdio")
    else:
        logger.info("Starting weaviate_mcp (transport=streamable-http) on %s:%s", _host, _port)
        mcp.run(transport="streamable-http")
