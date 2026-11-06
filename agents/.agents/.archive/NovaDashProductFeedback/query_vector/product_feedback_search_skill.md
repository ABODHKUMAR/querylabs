---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the NovaDashProductFeedback collection in Weaviate which contains
  customer feature requests, product feedback, usability reports, and roadmap discussions.
  
  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search
  
  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "NovaDashProductFeedback"
  - limit: Number of documents to retrieve (default 10, max 20)
  
  ## Search Strategy
  1. Use feature names: "cohort analysis", "funnel", "attribution", "LTV", "reporting"
  2. Use feedback keywords: "feature request", "enhancement", "bug", "improvement"
  3. Use UX terms: "usability", "user experience", "interface", "workflow"
  4. Use priority indicators: "critical", "high priority", "must have", "blocker"
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and identify feedback patterns
  
  ## Important
  - ALWAYS set collection_name="NovaDashProductFeedback" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing product insights
  - If no relevant feedback is found, say so clearly
  - Identify patterns across multiple customer requests
  
  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="feature requests for improved attribution modeling",
    collection_name="NovaDashProductFeedback",
    limit=10
  )
  ```
  
  ```
  retrieve_docs_from_collection(
    query="usability issues with dashboard creation",
    collection_name="NovaDashProductFeedback",
    limit=15
  )
  ```
  
  ```
  retrieve_docs_from_collection(
    query="API integration feature requests",
    collection_name="NovaDashProductFeedback",
    limit=10
  )
  ```
---

# NovaDashProductFeedback Search Skill

Vector search skill for NovaDash product feedback and feature requests.

## Purpose

Retrieve customer feature requests, product feedback, usability insights, and roadmap
discussions from the NovaDashProductFeedback Weaviate collection.

## Collection Content

- Feature requests and product enhancements
- Bug reports and technical issues
- Usability feedback and UX improvements
- Integration and API requests
- Performance and scalability concerns
- Competitive feature comparisons
- Product roadmap priorities

## Search Examples

- "What are the most requested features for cohort analysis?"
- "Show usability issues reported by Enterprise customers"
- "List API integration requests from last quarter"
- "What features do customers compare with competitors?"
- "Find critical bugs reported in the reporting module"
