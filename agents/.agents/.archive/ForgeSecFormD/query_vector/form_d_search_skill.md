---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the ForgeSecFormD collection in Weaviate which contains SEC Form D
  and Form D/A amendment filings for private securities offerings on the Forge Global platform.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "ForgeSecFormD"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use issuer or ticker terms (e.g., "TechGrowth", "TGRW", "GreenEnergy", "GNRG", "ALPHA")
  2. Use Reg D rule terms: "Rule 506(b)", "Rule 506(c)", "general solicitation", "accredited investor"
  3. Use offering structure terms: "preferred stock", "Series B", "Series D", "structured note", "derivative"
  4. Use transaction terms: "placement agent", "use of proceeds", "amendment", "Form D/A"
  5. Use Forge terms: "Forge Global Securities", "secondary market", "Forge platform"
  6. Start with limit=10, increase if more context is needed

  ## Important
  - ALWAYS set collection_name="ForgeSecFormD" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite issuer name, ticker, filing date, and SEC accession number in responses
  - If no relevant filings are found, say so clearly

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="Rule 506(c) offerings with general solicitation and accredited investor verification",
    collection_name="ForgeSecFormD",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Form D amendment material changes use of proceeds",
    collection_name="ForgeSecFormD",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Forge Global Securities placement agent fee structured note derivative",
    collection_name="ForgeSecFormD",
    limit=10
  )
  ```
---

# ForgeSecFormD Search Skill

Vector search skill for Forge Global SEC Form D filings and private securities offering records.

## Purpose

Retrieve SEC Form D filings, Form D/A amendments, offering summaries, investor composition
disclosures, and use-of-proceeds details from the ForgeSecFormD Weaviate collection.

## Collection Content

- SEC Form D filings (Rule 506(b) and Rule 506(c) offerings)
- Form D/A amendments disclosing material changes
- Offering amounts, security types, and first sale dates
- Investor composition (accredited vs. non-accredited counts)
- Use-of-proceeds allocations per offering
- Placement agent details (Forge Global Securities LLC fees)
- Forge platform secondary market observations tied to filings

## Search Examples

- "Show all Rule 506(c) offerings on the Forge platform"
- "What are the use of proceeds for TechGrowth's Series D?"
- "Which Form D amendments disclosed a reduction in offering amount?"
- "Find offerings involving non-accredited investors"
- "What placement fees does Forge Global Securities charge?"
- "Show secondary market implications from recent Form D filings"
