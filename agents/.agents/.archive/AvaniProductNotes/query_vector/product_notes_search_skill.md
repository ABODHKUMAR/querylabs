---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the AvaniProductNotes collection in Weaviate, which contains product
  notes, feedback, and development insights for Avani Lifestyle, covering all product lines
  including leggings, footwear, mens apparel, and accessories.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "AvaniProductNotes"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use product names, feedback topics, or feature keywords
  2. Use keywords like "product feedback", "feature request", "development note"
  3. Use product line terms: "leggings", "footwear", "Stride", "Seamless Sculpt", "mens"
  4. Start with limit=10, increase if more context is needed
  5. Review returned documents and extract relevant product insights

  ## Important
  - ALWAYS set collection_name="AvaniProductNotes" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing product-specific insights
  - If no relevant notes are found, say so clearly
  - Maintain confidentiality when discussing product information

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="Avani Stride footwear return rate and fit issues",
    collection_name="AvaniProductNotes",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Seamless Sculpt leggings quality and customer feedback",
    collection_name="AvaniProductNotes",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="mens product line expansion SKU roadmap",
    collection_name="AvaniProductNotes",
    limit=15
  )
  ```
---

# AvaniProductNotes Search Skill

Vector search skill for Avani Lifestyle product notes, feedback, and development insights.

## Purpose

Retrieve product notes, customer feedback reports, development memos, and quality
documentation from the AvaniProductNotes Weaviate collection.

## Collection Content

- Product launch readiness notes and go-to-market documentation
- Customer feedback: return rate analysis, fit issues, quality complaints
- Development memos: design decisions, factory partner evaluations, material sourcing
- Postmortem reports: launch failure analysis and remediation plans
- Product roadmap items: upcoming lines, SKU expansions, new category entries
- Quality assurance notes: manufacturing defects, testing gaps, spec compliance

## Search Examples

- "What were the fit and quality issues with the Stride Runner and Trainer?"
- "Find customer feedback on the High-Rise 7/8 leggings"
- "Show development notes on the mens product line expansion"
- "What factory issues caused the Stride launch failure?"
- "Find quality hold details on Jiangsu Textiles January shipment"
