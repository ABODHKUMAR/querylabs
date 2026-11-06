---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the AvaniStoreReports collection in Weaviate, which contains store
  performance reports and analytics for Avani Lifestyle, covering all retail locations
  including SoHo, Austin, Scottsdale, Tampa, Honolulu, and Palo Alto.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "AvaniStoreReports"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use store names, locations, or performance metrics
  2. Use keywords like "sales report", "store analytics", "performance benchmark"
  3. Use location names: "Austin", "SoHo", "Scottsdale", "Tampa", "Honolulu", "Palo Alto"
  4. Start with limit=10, increase if more context is needed
  5. Review returned documents and extract relevant store insights

  ## Important
  - ALWAYS set collection_name="AvaniStoreReports" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing store-specific insights
  - If no relevant reports are found, say so clearly
  - Maintain confidentiality when discussing store data

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="Austin store same-store sales growth and conversion rate",
    collection_name="AvaniStoreReports",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="SoHo lease renegotiation four-wall contribution margin",
    collection_name="AvaniStoreReports",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Scottsdale cannibalization outlet vs full-price store performance",
    collection_name="AvaniStoreReports",
    limit=15
  )
  ```
---

# AvaniStoreReports Search Skill

Vector search skill for Avani Lifestyle store performance reports and retail analytics.

## Purpose

Retrieve store performance reports, expansion proposals, lease analyses, and retail
analytics from the AvaniStoreReports Weaviate collection.

## Collection Content

- Monthly and quarterly performance reports by store location
- Store expansion proposals with buildout costs and revenue projections
- Lease renewal and renegotiation summaries
- Halo effect analysis: DTC uplift attributed to physical store presence
- Fleet benchmarking: revenue per sq ft, conversion rates, SSG by location
- Store format innovation: Avani Studio concept, outlet vs full-price testing

## Search Examples

- "Show Austin store performance and same-store sales growth"
- "What is the halo effect data for stores on DTC revenue?"
- "Find SoHo lease renegotiation details and new terms"
- "Compare conversion rates across all Avani store locations"
- "Show Scottsdale cannibalization analysis between outlet and standard store"
