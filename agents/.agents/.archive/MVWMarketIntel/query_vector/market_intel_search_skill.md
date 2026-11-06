---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the MVWMarketIntel collection in Weaviate, which contains vacation ownership
  industry reports, competitive landscape analyses, and market intelligence for Marriott Vacations
  Worldwide strategic planning, including ARDA industry benchmarks, Disney Vacation Club competitive
  analysis, and Florida market structural assessments.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "MVWMarketIntel"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use market or industry terms: "vacation ownership", "timeshare", "VPG", "delinquency rate"
  2. Use competitor names: "Disney Vacation Club", "Wyndham", "Bluegreen", "Hilton Grand Vacations"
  3. Use location market terms: "Florida", "Orlando", "Hawaii", "Colorado", "Arizona"
  4. Use strategic terms: "capital allocation", "repositioning", "divestiture", "brand conversion"
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and extract relevant benchmarks and strategic insights

  ## Important
  - ALWAYS set collection_name="MVWMarketIntel" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing market data or competitive benchmarks
  - If no relevant intelligence is found, say so clearly
  - Distinguish internal MVW strategy documents from third-party ARDA industry reports

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="vacation ownership industry VPG benchmarks and delinquency rates 2024",
    collection_name="MVWMarketIntel",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Disney Vacation Club expansion Orlando competition MVW Harbour Lake",
    collection_name="MVWMarketIntel",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Florida mid-scale vacation ownership structural headwinds Airbnb short-term rental",
    collection_name="MVWMarketIntel",
    limit=15
  )
  ```
---

# MVWMarketIntel Search Skill

Vector search skill for Marriott Vacations Worldwide vacation ownership market intelligence and competitive analysis.

## Purpose

Retrieve industry reports, competitive analyses, and market intelligence documents
from the MVWMarketIntel Weaviate collection to support MVW strategic planning
and capital allocation decisions.

## Collection Content

- ARDA vacation ownership market outlook — industry size, growth rates, segment performance
- Brand satisfaction rankings — industry-wide owner satisfaction index by operator
- VPG and delinquency benchmarks by market segment (luxury, mid-scale, Florida)
- Disney Vacation Club competitive analysis — expansion strategy and market impact
- Florida market structural assessment — DVC competition, Airbnb pressure, mid-scale decline
- Premium segment dynamics — Hawaii, Colorado, Arizona demand and pricing power
- Strategic options frameworks — renovation, brand conversion, divestiture analysis

## Search Examples

- "What are the industry benchmarks for VPG by market (Hawaii, Florida, Colorado)?"
- "How does Disney Vacation Club's expansion affect MVW's Orlando properties?"
- "Show the brand satisfaction rankings for all major vacation ownership operators"
- "What are the structural headwinds facing Florida mid-scale timeshare properties?"
- "Find strategic options analysis for underperforming vacation ownership assets"
