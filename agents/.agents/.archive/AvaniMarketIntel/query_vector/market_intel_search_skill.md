---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the AvaniMarketIntel collection in Weaviate, which contains market
  intelligence, industry trends, and competitive analysis for Avani Lifestyle, covering
  competitors like Vuori, Alo Yoga, and Lululemon, plus broader athleisure market dynamics.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "AvaniMarketIntel"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use industry terms, competitor names, or trend keywords
  2. Use keywords like "market share", "industry report", "competitive analysis"
  3. Use brand names: "Lululemon", "Vuori", "Alo Yoga", "athleisure", "premium activewear"
  4. Start with limit=10, increase if more context is needed
  5. Review returned documents and extract relevant market insights

  ## Important
  - ALWAYS set collection_name="AvaniMarketIntel" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing market insights
  - If no relevant intelligence is found, say so clearly
  - Maintain confidentiality when discussing market data

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="Vuori Series D funding and women's leggings expansion",
    collection_name="AvaniMarketIntel",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Alo Yoga retail store expansion strategy 2025",
    collection_name="AvaniMarketIntel",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Lululemon mens business growth and competitive positioning",
    collection_name="AvaniMarketIntel",
    limit=15
  )
  ```
---

# AvaniMarketIntel Search Skill

Vector search skill for Avani Lifestyle market intelligence and competitive analysis.

## Purpose

Retrieve market research, competitive intelligence, industry reports, and trend analysis
from the AvaniMarketIntel Weaviate collection.

## Collection Content

- Competitor profiles and strategic move tracking (Vuori, Alo Yoga, Lululemon)
- Athleisure market size, growth rates, and category dynamics
- Investment and funding rounds in the competitive landscape
- Retail expansion strategies and store format trends
- Consumer behavior shifts: DTC vs wholesale, digital vs physical
- Category-specific intelligence: womens performance, mens athleisure, footwear

## Search Examples

- "What competitive threats does Vuori pose to Avani's women's leggings?"
- "Show Alo Yoga retail expansion plan near Avani flagship locations"
- "How is Lululemon positioning in mens athleisure?"
- "Find market share data for premium athleisure brands"
- "What are the industry trends driving DTC vs wholesale channel shift?"
