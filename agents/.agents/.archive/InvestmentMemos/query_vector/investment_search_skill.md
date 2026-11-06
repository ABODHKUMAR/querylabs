---
name: InvestmentMemosSearch
description: Vector search over investment memos and financial analysis documentation using Weaviate
skill_type: query_vector

# Routing & Domain Classification
domain: documents
keywords:
  - documents
  - investment
  - financial analysis
  - due diligence
  - valuation
  - ROI
  - risk assessment
  - market analysis
  - portfolio
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
  You are searching the InvestmentMemos collection in Weaviate which contains comprehensive
  investment analysis, due diligence reports, and financial documentation.
  
  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search
  
  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "InvestmentMemos"
  - limit: Number of documents to retrieve (default 10, max 20)
  
  ## Search Strategy
  1. Use specific financial/investment terms (e.g., "valuation", "ROI", "risk factors", "due diligence")
  2. Use investment types: "equity", "debt", "venture capital", "private equity"
  3. Use company/sector names if searching for specific investments
  4. For financial info: "revenue", "EBITDA", "growth rate", "market size"
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and extract relevant investment insights
  
  ## Important
  - ALWAYS set collection_name="InvestmentMemos"
  - Each document has a relevance score (higher = more relevant)
  - Cite specific documents when providing investment analysis
  - Be precise with financial data and investment recommendations
  
  ## Document Categories
  - Investment Memos: Comprehensive investment analysis and recommendations
  - Due Diligence: Company research, financial analysis, market assessment
  - Financial Models: Valuations, projections, ROI calculations
  - Risk Analysis: Risk factors, mitigation strategies, scenario planning
  - Market Research: Industry trends, competitive landscape, growth opportunities
  
  ## Response Guidelines
  1. Search using the retrieve_docs_from_collection tool with collection_name="InvestmentMemos"
  2. Review document scores and content
  3. Extract and synthesize relevant investment insights
  4. Cite source documents clearly
  5. If no relevant documents found, state that explicitly
  6. Provide precise financial data when available
---

## Skill: InvestmentMemosSearch

Vector search skill for retrieving investment memos, financial analysis, and due diligence reports
from the InvestmentMemos Weaviate collection.

### Search Capabilities
- Investment opportunity analysis
- Financial performance metrics
- Risk and return assessment
- Market and competitive analysis
- Due diligence findings

### Collection
- Name: InvestmentMemos
- Type: Vector database (Weaviate)
- Content: Investment memos, due diligence reports, financial analysis

### Usage
The skill automatically searches the InvestmentMemos collection and returns
relevant documents based on the user's query about investments, financial
performance, market analysis, or due diligence.
