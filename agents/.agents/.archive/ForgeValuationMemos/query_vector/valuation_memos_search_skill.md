---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the ForgeValuationMemos collection in Weaviate which contains 409A
  valuation reports, structured instrument fair value memos, fixed-income credit analyses,
  board meeting notes, and secondary market pricing reconciliation documents for private
  securities on the Forge Global platform.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "ForgeValuationMemos"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use issuer or ticker terms: "TechGrowth", "TGRW", "SafeBond", "SBND", "GreenEnergy", "GNRG", "ALPHA"
  2. Use valuation method terms: "409A", "OPM backsolve", "DCF", "mark-to-market", "comparable company", "EV/ARR"
  3. Use pricing anomaly terms: "speculative premium", "pricing anomaly", "stale mark", "fair value gap"
  4. Use discount terms: "DLOM", "DLOC", "liquidity discount", "credit risk", "CDS spread", "covenant breach"
  5. Use board terms: "board meeting", "IPO readiness", "cap table", "dual-class", "RSU", "banker selection"
  6. Use Forge Research terms: "Forge Research", "secondary trade price", "enhanced disclosure", "price reasonableness"
  7. Start with limit=10, increase if more context is needed

  ## Important
  - ALWAYS set collection_name="ForgeValuationMemos" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite company name, ticker, valuation date, methodology, and document type in responses
  - If no relevant memos are found, say so clearly

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="409A fair market value OPM backsolve DLOM common stock",
    collection_name="ForgeValuationMemos",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="secondary market price significantly above fair value speculative premium digital assets",
    collection_name="ForgeValuationMemos",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="SafeBond stale mark credit risk CDS spread covenant breach liquidity discount",
    collection_name="ForgeValuationMemos",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="board meeting IPO readiness S-1 filing banker selection cap table",
    collection_name="ForgeValuationMemos",
    limit=10
  )
  ```
---

# ForgeValuationMemos Search Skill

Vector search skill for Forge Global valuation memos, 409A reports, and board meeting notes on private securities.

## Purpose

Retrieve 409A valuation reports, structured instrument fair value analyses, fixed-income
credit memos, board meeting notes, and secondary market pricing reconciliation documents
from the ForgeValuationMemos Weaviate collection.

## Collection Content

- 409A valuation reports with FMV determinations for common stock
- Structured instrument valuation memos (principal protection components, options overlay)
- Fixed-income credit memos (CDS-implied adjustments, liquidity discounts, covenant risk)
- Board meeting notes with valuation methodology discussions and IPO planning
- Secondary market price vs. FMV reconciliation and anomaly flags from Forge Research
- Comparable company analysis (EV/ARR, EV/EBITDA multiples used as benchmarks)
- Compliance recommendations triggered by valuation findings (enhanced disclosures, price checks)

## Search Examples

- "What is the 409A FMV for TechGrowth Inc common stock?"
- "Which securities have secondary trade prices significantly above fair value?"
- "Explain the valuation methodology debate for GreenEnergy's Series B pricing"
- "What credit risks are driving SafeBond's secondary market discount?"
- "Show board meeting notes on TechGrowth IPO readiness"
- "Find all cases where Forge Research flagged a pricing anomaly"
- "What DLOM and DLOC were applied in the TechGrowth 409A?"
