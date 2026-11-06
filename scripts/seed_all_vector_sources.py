#!/usr/bin/env python3
"""
Seed all Query Labs vector data sources:
  1) Weaviate collections used by query_vector skills
  2) OpenAI vector store used by Radium (query_vector_openai)

Requires: OPENAI_API_KEY, local Weaviate running.
Writes VECTOR_STORE_ID_RADIUM into .env.agent when Radium store is created.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if not (ROOT / ".env.agent").exists() and Path("/work/.env.agent").exists():
    ROOT = Path("/work")


def _load_openai_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key and not key.startswith("sk-your"):
        return key
    for env_file in (ROOT / ".env.agent", ROOT / ".env.weaviate.mcp"):
        if not env_file.is_file():
            continue
        for line in env_file.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                key = line.split("=", 1)[1].strip()
                if key and not key.startswith("sk-your"):
                    return key
    raise SystemExit("OPENAI_API_KEY not found. Set it or regenerate local env first.")


DOCS: dict[str, list[dict[str, str]]] = {
    "AvaniExecMemos": [
        {
            "title": "Q1 2025 Executive Product Memo",
            "content": (
                "Avani Lifestyle Q1 2025 executive memo. Product highlights: FlexRun Leggings and "
                "StormShell Jacket drove 56% gross margin. DTC revenue reached $310k in January. "
                "Priority: expand Trail Soft Runner inventory and raise Meta campaign ROAS above 4.0. "
                "Risk: stockouts on Outerwear Seasonal collection in West stores."
            ),
        },
        {
            "title": "Margin Expansion Initiative",
            "content": (
                "Product strategy memo: shift mix toward Core collection SKUs with COGS under $20. "
                "Target EBITDA margin 23%+. Wholesale partner Book for Spring contributed $54k attributed revenue."
            ),
        },
    ],
    "AvaniMarketIntel": [
        {
            "title": "Athleisure Market Pulse",
            "content": (
                "Market intel: athleisure demand up 9% YoY in APAC metros. Competitors discounting "
                "leggings 15-20%. Avani recommendation: protect FlexRun price and push AirFlow Top bundles."
            ),
        },
        {
            "title": "TikTok Fitness Trend Report",
            "content": (
                "Trail Season Push on TikTok showed CAC $25 and ROAS 4.03. Product content featuring "
                "Trail Soft Runner outperformed Studio Tote creatives by 28%."
            ),
        },
    ],
    "AvaniProductNotes": [
        {
            "title": "FlexRun Leggings Spec",
            "content": (
                "Product note: FlexRun Leggings. Category Leggings, collection Core, supplier KnitWorks. "
                "COGS $18, MSRP $68. High sell-through 62%. Ideal for DTC-Organic and retail flagship stores."
            ),
        },
        {
            "title": "StormShell Jacket Launch Notes",
            "content": (
                "StormShell Jacket Seasonal Outerwear. COGS $42, MSRP $148. Weeks of supply 3.1 — "
                "reorder urgently. Strong conversion in flagship Mumbai and Delhi stores."
            ),
        },
    ],
    "AvaniStoreReports": [
        {
            "title": "Avani Central January Store Report",
            "content": (
                "Store report Avani Central (flagship, Mumbai): foot traffic 18,500, conversion 18.5%, "
                "avg transaction $62.40, same-store YoY +8.2%. Top products: FlexRun Leggings and AirFlow Top."
            ),
        },
        {
            "title": "Avani Park Performance",
            "content": (
                "Avani Park Bengaluru standard format: conversion 16.8%, revenue per staff hour $61.50. "
                "Recommend more Mens Forge Tee inventory for weekend traffic."
            ),
        },
    ],
    "NovaDashCsNotes": [
        {
            "title": "Globex Apparel CSM Note",
            "content": (
                "CS note: Globex Apparel (Enterprise, Apparel & Fashion) health score 61, status at_risk. "
                "Open critical ticket on Attribution Accuracy. Usage of feature_ltv is off. "
                "Ask for exec sponsor before June renewal."
            ),
        },
        {
            "title": "Acme Cosmetics QBR Summary",
            "content": (
                "Acme Cosmetics Growth tier healthy (score 82). Strong product usage on cohort analysis, "
                "funnel, LTV, attribution. Forecast renew_expand with $24k expansion potential on Insights Pro."
            ),
        },
    ],
    "NovaDashMarketReport": [
        {
            "title": "Beauty Analytics Market Report",
            "content": (
                "Market report: Beauty & Cosmetics brands increasing spend on product analytics platforms. "
                "NovaDash customers in beauty show higher NPS when attribution feature is enabled."
            ),
        },
        {
            "title": "Fashion Retail SaaS Outlook",
            "content": (
                "Apparel & Fashion accounts are most at-risk cohort. Product recommendation: "
                "bundle API + attribution modules for Enterprise renewals."
            ),
        },
    ],
    "NovaDashProductFeedback": [
        {
            "title": "Product Feedback — Dashboards",
            "content": (
                "Customer feedback: dashboards_viewed high for CircuitCart and TrailForge. "
                "Request for faster product cohort export. Feature request prioritized for Q2."
            ),
        },
        {
            "title": "API Product Feedback",
            "content": (
                "Electronics customers praise API product reliability. CircuitCart ran 21k API calls "
                "in January with low support volume."
            ),
        },
    ],
    "MVWResortReports": [
        {
            "title": "Palm Cove January Resort Report",
            "content": (
                "Palm Cove (Marriott Vacation Club) occupancy 78.5%, owner satisfaction 8.4. "
                "January tours 380, VPG $4263, close rate 12.4%. Product focus: Signature ownership packages."
            ),
        },
        {
            "title": "Coral Bay Sales Product Report",
            "content": (
                "Coral Bay Orlando: highest tour capacity 500/month. Contract sales $1.88M in January. "
                "Recommend Presidential upgrades during spring break inventory windows."
            ),
        },
    ],
    "MVWOwnerFeedback": [
        {
            "title": "Owner Feedback — Delinquency Risk",
            "content": (
                "Owner Diego Alvarez (Signature, Palm Cove) MF delinquent 120 days, satisfaction 5.8, "
                "no 2024 stays. Product retention play: offer points rental credit + payment plan."
            ),
        },
        {
            "title": "Presidential Owner Satisfaction",
            "content": (
                "Emma Brooks Presidential owner at Royal Sands reports satisfaction 8.7 after four stays. "
                "Positive feedback on exchange product and digital portal logins."
            ),
        },
    ],
    "MVWMarketIntel": [
        {
            "title": "Vacation Ownership Market Intel",
            "content": (
                "Market intel: vacation ownership VPG stable in Hawaii and Florida. "
                "Mountain resorts softer close rates (~10%). Product mix shift toward Signature tiers."
            ),
        },
        {
            "title": "Renovation Impact Brief",
            "content": (
                "Royal Sands under renovation — short-term tour capacity constrained. "
                "Redirect sales product inventory to Coral Bay and Palm Cove."
            ),
        },
    ],
    "BoardMeetingNotes": [
        {
            "title": "Meridian Board Notes — Product Portfolio",
            "content": (
                "Board notes: Northwind Labs Analytics Suite ARR $4.2M, status green. "
                "Shiply release automation product runway 8 months — monitor burn. "
                "Approve follow-on for Ledgerly accounting AI product."
            ),
        },
        {
            "title": "Q1 Portfolio Product Review",
            "content": (
                "PulseCart recommendation engine MoM growth 14% but amber status. "
                "Ask for clearer product roadmap before Series A bridge."
            ),
        },
    ],
    "MarketSectorReports": [
        {
            "title": "B2B SaaS Sector Report",
            "content": (
                "Sector report: B2B SaaS product analytics companies trading at higher multiples when "
                "net revenue retention >110%. Northwind Labs fits this profile."
            ),
        },
        {
            "title": "FinTech Product Sector Brief",
            "content": (
                "FinTech embedded payments and SMB accounting products remain resilient. "
                "Blue Harbor and Ledgerly flagged as core Meridian product bets."
            ),
        },
    ],
    "InvestmentMemos": [
        {
            "title": "Investment Memo — Northwind Labs",
            "content": (
                "Investment memo: Northwind Labs product is B2B product analytics platform. "
                "Series A investment $2.5M, valuation $48M, ARR $4.2M, MoM growth 8.5%. "
                "Thesis: expand Insights Pro SKU into enterprise seats."
            ),
        },
        {
            "title": "Investment Memo — Shiply",
            "content": (
                "Shiply DevTools product: release automation for engineering teams. Seed $750k. "
                "ARR $420k, runway 8 months, status red. Condition next capital on self-serve conversion."
            ),
        },
    ],
    "ForgeKYCAMLReports": [
        {
            "title": "KYC Summary Report",
            "content": (
                "KYC report: Ava Thompson and Noah Patel approved. Mia Garcia pending source-of-wealth. "
                "Product implication: block new secondary trades for pending KYC investors."
            ),
        },
        {
            "title": "AML Alert Digest",
            "content": (
                "AML alert: investor Mia Garcia medium severity unexplained transfer pattern (open). "
                "Horizon Capital low severity round-trip closed. Escalate open alert before order routing."
            ),
        },
    ],
    "ForgeSecFormD": [
        {
            "title": "Form D — Northwind Labs",
            "content": (
                "Form D filed with SEC for Northwind Labs preferred offering on 2024-06-20. "
                "Status filed. Linked security ticker NWND."
            ),
        },
        {
            "title": "Form D — Blue Harbor",
            "content": (
                "Form D filed 2023-12-01 for Blue Harbor financing round. Security BLHB common shares."
            ),
        },
    ],
    "ForgeValuationMemos": [
        {
            "title": "Valuation Memo January 2025",
            "content": (
                "Valuation memo: NWND $12.50 (409A), BLHB $28.40 (market_comp), "
                "PSCT $4.75 (409A), LDGR $9.20 (409A). Product desk should use these marks for holdings."
            ),
        },
        {
            "title": "Secondary Pricing Notes",
            "content": (
                "Recent trade prints: NWND executed 12.42, BLHB 28.15 / 28.48, PSCT 4.72, LDGR 9.12. "
                "Settlement pending on BLHB partial sell trade."
            ),
        },
    ],
    "Evolus_pdf": [
        {
            "title": "Jeuveau Product Overview",
            "content": (
                "Evolus product documentation: Jeuveau is an FDA-approved botulinum toxin type A product "
                "for temporary improvement of moderate to severe glabellar lines. Follow labeled dosing "
                "and administration technique. Store and reconstitute per prescribing information."
            ),
        },
        {
            "title": "Evolysse Fillers and Programs",
            "content": (
                "Evolysse Form and Evolysse Smooth are Evolus dermal filler products. "
                "Commercial programs include Club Evolus patient subscription and Evolux provider loyalty. "
                "Review contraindications, adverse events, and contractual provider terms before treatment."
            ),
        },
        {
            "title": "Safety and Labeling Notes",
            "content": (
                "Safety summary: screen for contraindications, discuss warnings/precautions, monitor "
                "adverse events and drug interactions. Use only approved indications for Jeuveau and Evolysse."
            ),
        },
    ],
}

RADIUM_DOCS = [
    (
        "RADIUM.md",
        """# Radium Practice Overview
Radium stores Query Labs practice and offering documentation for RPA, Data Engineering, Strategy, Snowflake, and Services & Solutions.
Use this corpus to answer questions about service offerings, benefits, case studies, and practice capabilities.
""",
    ),
    (
        "RPA_Offering.md",
        """# RPA Offering
Service offering includes consulting (process discovery, vendor evaluation, roadmap, governance),
pilot programs & PoCs, end-to-end delivery (build through UAT), and continuous support.
Benefits: efficiency, 40-60% cost reduction potential, accuracy/compliance, scalability.
Case studies: invoice processing in PeopleSoft, merchandising inventory updates with computer vision,
cost variance reconciliation.
""",
    ),
    (
        "Data_Engineering.md",
        """# Data Engineering Practice
Capabilities: data platform assessments, pipeline modernization, lakehouse design, quality frameworks,
and analytics enablement for product and revenue teams.
""",
    ),
    (
        "Snowflake_Offering.md",
        """# Snowflake Offering
Snowflake practice covers warehouse architecture, cost governance, secure data sharing,
and product analytics marts for SaaS metrics (MRR, usage, retention).
""",
    ),
]


def embed_texts(client, texts: list[str]) -> list[list[float]]:
    from openai import OpenAI

    oai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    model = os.environ.get("WEAVIATE_EMBEDDING_MODEL", "text-embedding-3-small")
    # batch
    resp = oai.embeddings.create(input=texts, model=model)
    # ensure order
    by_idx = {item.index: item.embedding for item in resp.data}
    return [by_idx[i] for i in range(len(texts))]


def seed_weaviate(openai_key: str) -> None:
    import weaviate
    from weaviate.classes.config import Configure, DataType, Property
    from weaviate.classes.init import Auth

    os.environ["OPENAI_API_KEY"] = openai_key
    host = os.environ.get("WEAVIATE_HOST", "127.0.0.1")
    port = int(os.environ.get("WEAVIATE_PORT", "8082"))
    api_key = os.environ.get("WEAVIATE_API_KEY", "querylab-weaviate-key")

    print(f"Connecting to Weaviate {host}:{port} ...")
    client = weaviate.connect_to_local(
        host=host,
        port=port,
        auth_credentials=Auth.api_key(api_key),
        skip_init_checks=True,
    )
    try:
        existing = set(client.collections.list_all().keys())
        for collection_name, docs in DOCS.items():
            if collection_name in existing:
                print(f"  recreate {collection_name}")
                client.collections.delete(collection_name)
            client.collections.create(
                name=collection_name,
                vectorizer_config=Configure.Vectorizer.none(),
                properties=[
                    Property(name="title", data_type=DataType.TEXT),
                    Property(name="content", data_type=DataType.TEXT),
                    Property(name="source", data_type=DataType.TEXT),
                ],
            )
            texts = [f"{d['title']}\n\n{d['content']}" for d in docs]
            vectors = embed_texts(None, texts)
            coll = client.collections.get(collection_name)
            for doc, vector, text in zip(docs, vectors, texts):
                coll.data.insert(
                    properties={
                        "title": doc["title"],
                        "content": text,
                        "source": collection_name,
                    },
                    vector=vector,
                )
            print(f"  seeded {collection_name}: {len(docs)} docs")
        print(f"Weaviate collections ready: {len(DOCS)}")
    finally:
        client.close()


def upsert_env_agent(vector_store_id: str, openai_key: str) -> None:
    path = ROOT / ".env.agent"
    lines = []
    if path.is_file():
        lines = path.read_text().splitlines()
    kv = {}
    order = []
    for line in lines:
        if not line.strip() or line.strip().startswith("#") or "=" not in line:
            order.append(("raw", line))
            continue
        k, v = line.split("=", 1)
        kv[k] = v
        order.append(("kv", k))
    kv["OPENAI_API_KEY"] = openai_key
    kv["OPENAI_API_KEY_RADIUM"] = openai_key
    kv["VECTOR_STORE_ID_RADIUM"] = vector_store_id
    if "OPENAI_API_KEY_RADIUM" not in [k for t, k in order if t == "kv"]:
        order.append(("kv", "OPENAI_API_KEY_RADIUM"))
    if "VECTOR_STORE_ID_RADIUM" not in [k for t, k in order if t == "kv"]:
        order.append(("kv", "VECTOR_STORE_ID_RADIUM"))
    out = []
    seen = set()
    for t, x in order:
        if t == "raw":
            out.append(x)
        else:
            if x in seen:
                continue
            seen.add(x)
            out.append(f"{x}={kv[x]}")
    for k, v in kv.items():
        if k not in seen:
            out.append(f"{k}={v}")
    path.write_text("\n".join(out) + "\n")
    print(f"Updated {path} with VECTOR_STORE_ID_RADIUM={vector_store_id}")


def seed_radium(openai_key: str) -> str:
    from openai import OpenAI

    oai = OpenAI(api_key=openai_key)
    print("Creating OpenAI vector store for Radium ...")
    store = oai.vector_stores.create(name="querylab-radium")
    file_ids = []
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        for filename, body in RADIUM_DOCS:
            fp = td_path / filename
            fp.write_text(body)
            uploaded = oai.files.create(file=fp.open("rb"), purpose="assistants")
            file_ids.append(uploaded.id)
        oai.vector_stores.file_batches.create_and_poll(
            vector_store_id=store.id,
            file_ids=file_ids,
        )
    print(f"Radium vector store ready: {store.id} ({len(file_ids)} files)")
    return store.id


def main() -> None:
    openai_key = _load_openai_key()
    os.environ["OPENAI_API_KEY"] = openai_key
    seed_weaviate(openai_key)
    store_id = seed_radium(openai_key)
    upsert_env_agent(store_id, openai_key)
    print("\nDone. Restart agents to pick up Radium env:")
    print("  docker compose up -d agents")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
