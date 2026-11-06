---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the MVWResortReports collection in Weaviate, which contains GM quarterly
  operations reports and resort-level strategic assessments across all 15 Marriott Vacations
  Worldwide properties spanning five brands: Marriott Vacation Club, Sheraton Vacation Club,
  Westin Vacation Club, Hyatt Vacation Club, and Ritz-Carlton Club.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "MVWResortReports"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use resort names, brands, or locations as primary search terms
  2. Use operational keywords: "occupancy", "sales team", "renovation", "amenity", "staffing"
  3. Use brand names: "Marriott Vacation Club", "Westin", "Sheraton", "Hyatt", "Ritz-Carlton Club"
  4. Use location names: "Maui", "Aspen", "Scottsdale", "Orlando", "Vistana", "PGA"
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and extract relevant operational insights

  ## Important
  - ALWAYS set collection_name="MVWResortReports" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing resort-specific insights
  - If no relevant reports are found, say so clearly
  - These are internal GM reports — maintain appropriate confidentiality

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="Westin Nanea occupancy demand and expansion recommendation",
    collection_name="MVWResortReports",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Sheraton PGA spa closure HVAC failure sales team issues",
    collection_name="MVWResortReports",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Sheraton Vistana Villages renovation progress owner communication",
    collection_name="MVWResortReports",
    limit=15
  )
  ```
---

# MVWResortReports Search Skill

Vector search skill for Marriott Vacations Worldwide GM operations reports and resort assessments.

## Purpose

Retrieve GM quarterly operations reports, facility status updates, and strategic assessments
from the MVWResortReports Weaviate collection, covering all 15 MVW resort properties.

## Collection Content

- GM quarterly operations reports by property (occupancy, sales, owner experience)
- Facility and amenity status: closures, HVAC, renovation progress, capital needs
- Sales team performance context and VPG drivers per resort
- Owner demand signals and expansion opportunity flags
- Strategic risk assessments for under-renovation and strategic-review properties
- Capital investment recommendations from resort GMs

## Search Examples

- "What does the GM report say about Westin Nanea expansion opportunity?"
- "Find operational issues at Sheraton PGA — spa closure and HVAC failures"
- "Show Sheraton Vistana renovation progress and owner communication status"
- "What are the GM recommendations for Ritz-Carlton Club Aspen second season?"
- "Which resorts are flagging staffing issues or sales team changes?"
