---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the NovaDashMarketReport collection in Weaviate which contains
  market analysis reports, competitive intelligence, and industry research for SaaS analytics.
  
  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search
  
  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "NovaDashMarketReport"
  - limit: Number of documents to retrieve (default 10, max 20)
  
  ## Search Strategy
  1. Use market keywords: "market size", "growth rate", "TAM", "market share"
  2. Use competitive terms: "competitors", "pricing", "positioning", "differentiation"
  3. Use trend keywords: "trends", "emerging", "adoption", "forecast"
  4. Use industry segments: "e-commerce", "retail", "SaaS", specific verticals
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and extract relevant market insights
  
  ## Important
  - ALWAYS set collection_name="NovaDashMarketReport" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing market insights
  - If no relevant reports are found, say so clearly
  - Identify trends across multiple reports
  
  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="SaaS analytics market size and growth forecast",
    collection_name="NovaDashMarketReport",
    limit=10
  )
  ```
  
  ```
  retrieve_docs_from_collection(
    query="competitive analysis of business intelligence platforms",
    collection_name="NovaDashMarketReport",
    limit=15
  )
  ```
  
  ```
  retrieve_docs_from_collection(
    query="pricing strategies for analytics SaaS products",
    collection_name="NovaDashMarketReport",
    limit=10
  )
  ```
---

# NovaDashMarketReport Search Skill

Vector search skill for market analysis and competitive intelligence in the SaaS analytics sector.

## Purpose

Retrieve market reports, competitive analysis, industry trends, and research insights
from the NovaDashMarketReport Weaviate collection.

## Collection Content

- Market size and growth analysis
- Competitive landscape and vendor profiles
- Industry trends and forecasts
- Customer research and buyer behavior
- Pricing analysis and benchmarks
- Technology trends (AI/ML, automation)
- Regional market insights

## Search Examples

- "What is the current market size for SaaS analytics platforms?"
- "Show competitive analysis of top analytics vendors"
- "What are emerging trends in business intelligence?"
- "List pricing models used by competitors"
- "Find research on e-commerce analytics adoption"
