---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the Evolus_pdf collection in Weaviate which contains comprehensive
  documentation for Evolus' U.S. aesthetics products and programs.
  
  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search
  
  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "Evolus_pdf"
  - limit: Number of documents to retrieve (default 10, max 20)
  
  ## Search Strategy
  1. Use specific medical/clinical terms for product information (e.g., "contraindications", "dosing", "administration")
  2. Use product names: "Jeuveau", "Evolysse Form", "Evolysse Smooth"
  3. Use program names: "Club Evolus", "Evolux program"
  4. For regulatory info: "indications for use", "FDA labeling", "warnings"
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and extract relevant clinical/regulatory information
  
  ## Important
  - ALWAYS set collection_name="Evolus_pdf" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when answering medical/regulatory questions
  - If no relevant documents are found, say so clearly
  - Be precise with clinical and regulatory information
  
  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="Jeuveau approved indications and dosing",
    collection_name="Evolus_pdf",
    limit=5
  )
  ```
  
  ```
  retrieve_docs_from_collection(
    query="Evolysse Form contraindications and warnings",
    collection_name="Evolus_pdf",
    limit=10
  )
  ```
  
  ```
  retrieve_docs_from_collection(
    query="Club Evolus membership terms and benefits",
    collection_name="Evolus_pdf",
    limit=8
  )
  ```
  
  ## Content Categories in Collection
  - **Regulatory Labeling**: FDA-approved indications, warnings, precautions
  - **Clinical Instructions**: Dosing, administration techniques, treatment protocols
  - **Safety Data**: Contraindications, adverse events, drug interactions
  - **Product Specifications**: Jeuveau, Evolysse Form, Evolysse Smooth details
  - **Commercial Programs**: Club Evolus (patient subscription), Evolux (provider loyalty)
  - **Legal/Contractual**: Terms of service, pricing agreements, program requirements
---

# Evolus Documentation Search Skill

This skill enables semantic search over the Evolus_pdf vector collection in Weaviate using the Model Context Protocol (MCP).

## Configuration
- **Skill Type**: query_vector
- **MCP Server**: weaviate_mcp (http://weaviate_mcp:8001/mcp)
- **Collection**: Evolus_pdf

## Usage
The agent will use the `retrieve_docs_from_collection` tool from the Weaviate MCP server to search Evolus product documentation. The tool performs hybrid search combining keyword and semantic matching for medical and regulatory content.
