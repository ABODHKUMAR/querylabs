---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the NovaDashCsNotes collection in Weaviate which contains customer
  success notes, QBR summaries, onboarding records, and account health insights.
  
  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search
  
  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "NovaDashCsNotes"
  - limit: Number of documents to retrieve (default 10, max 20)
  
  ## Search Strategy
  1. Use customer-specific terms (customer names, account IDs)
  2. Use CSM activity keywords: "QBR", "onboarding", "check-in", "escalation"
  3. Use health indicators: "churn risk", "at-risk", "expansion", "health score"
  4. Use engagement terms: "adoption", "usage", "feature requests", "feedback"
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and extract relevant customer insights
  
  ## Important
  - ALWAYS set collection_name="NovaDashCsNotes" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing customer insights
  - If no relevant notes are found, say so clearly
  - Maintain confidentiality when discussing customer information
  
  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="QBR discussions for Enterprise tier customers",
    collection_name="NovaDashCsNotes",
    limit=10
  )
  ```
  
  ```
  retrieve_docs_from_collection(
    query="onboarding challenges with data integration",
    collection_name="NovaDashCsNotes",
    limit=15
  )
  ```
  
  ```
  retrieve_docs_from_collection(
    query="churn risk indicators and mitigation strategies",
    collection_name="NovaDashCsNotes",
    limit=10
  )
  ```
---

# NovaDashCsNotes Search Skill

Vector search skill for NovaDash customer success notes and account insights.

## Purpose

Retrieve customer success notes, meeting summaries, QBR discussions, onboarding records,
and account health insights from the NovaDashCsNotes Weaviate collection.

## Collection Content

- QBR (Quarterly Business Review) summaries
- Customer onboarding notes and progress
- Health check-in observations
- Escalation records and resolutions
- Expansion opportunity discussions
- Churn risk assessments and mitigation plans

## Search Examples

- "Show QBR notes for customers in Beauty & Cosmetics industry"
- "Find onboarding challenges related to API integration"
- "List expansion opportunities discussed in last quarter"
- "What are common reasons for customer escalations?"
- "Show churn risk mitigation strategies for at-risk accounts"
