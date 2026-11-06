---
name: MarketSectorReportsSearch
description: Vector search over market research and sector analysis reports using Weaviate
skill_type: query_vector

# Routing & Domain Classification
domain: documents
keywords:
  - documents
  - market research
  - sector analysis
  - industry trends
  - competitive intelligence
  - market size
  - growth forecast
  - market dynamics
  - disruption
data_type: unstructured

# Phase 3: Enhanced Metadata
typical_execution_time_ms: 1000
confidence_level: high
output_format: text

mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the MarketSectorReports collection in Weaviate which contains comprehensive
  market research, sector analysis, and competitive intelligence documentation.
  
  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search
  
  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "MarketSectorReports"
  - limit: Number of documents to retrieve (default 10, max 20)
  
  ## Search Strategy
  1. Use specific market/industry terms (e.g., "market size", "growth rate", "competitive landscape")
  2. Use sector names: technology, healthcare, financial services, consumer goods, etc.
  3. Use analysis types: "SWOT", "Porter's Five Forces", "market segmentation"
  4. For trends: "emerging trends", "market drivers", "disruption", "innovation"
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and extract relevant market insights
  
  ## Important
  - ALWAYS set collection_name="MarketSectorReports"
  - Each document has a relevance score (higher = more relevant)
  - Cite specific documents when providing market data or analysis
  - Be precise with market data and industry information
  
  ## Document Categories
  - Market Research: Market size, growth forecasts, segmentation analysis
  - Sector Analysis: Industry structure, value chains, key trends
  - Competitive Intelligence: Competitor analysis, market share, positioning
  - Trend Reports: Emerging technologies, disruptive forces, innovation
  - Regulatory Environment: Policy changes, compliance requirements, market impact
  
  ## Response Guidelines
  1. Search using the retrieve_docs_from_collection tool with collection_name="MarketSectorReports"
  2. Review document scores and content
  3. Extract and synthesize relevant market insights
  4. Cite source documents clearly (including report dates if available)
  5. If no relevant documents found, state that explicitly
  6. Provide precise market data and trend analysis
---

## Skill: MarketSectorReportsSearch

Vector search skill for retrieving market research reports, sector analysis, and competitive
intelligence from the MarketSectorReports Weaviate collection.

### Search Capabilities
- Market size and growth data
- Industry trend analysis
- Competitive landscape review
- Sector dynamics insights
- Regulatory environment research

### Collection
- Name: MarketSectorReports
- Type: Vector database (Weaviate)
- Content: Market research, sector reports, competitive intelligence

### Usage
The skill automatically searches the MarketSectorReports collection and returns
relevant documents based on the user's query about market trends, industry dynamics,
competitive landscape, or sector analysis.
