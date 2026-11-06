---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the ForgeKYCAMLReports collection in Weaviate which contains KYC/AML
  investigation reports, compliance case findings, risk dispositions, and investor due
  diligence records for the Forge Global platform.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "ForgeKYCAMLReports"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use investor identifiers: "INV001", "INV003", "John Doe", "Robert Chen", "Alice Wonder"
  2. Use alert/case IDs: "ALT001", "ALT009", "ALT017", "CASE-2023-0041", "CASE-2023-0047"
  3. Use risk terms: "HIGH risk", "CRITICAL", "SAR filing", "suspicious activity report"
  4. Use KYC terms: "KYC FAIL", "KYC PASS", "source of wealth", "accreditation", "PEP", "OFAC"
  5. Use action terms: "account suspension", "trading privileges suspended", "account closure", "duplicate account"
  6. Use investigator terms: "enhanced due diligence", "CAMS", "FINRA", "SAR"
  7. Start with limit=10, increase if more context is needed

  ## Important
  - ALWAYS set collection_name="ForgeKYCAMLReports" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite case number, investor ID, investigator name, and report date in responses
  - Treat all content as confidential compliance information
  - If no relevant reports are found, say so clearly

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="CRITICAL risk investors with SAR filing recommendation",
    collection_name="ForgeKYCAMLReports",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="KYC FAIL duplicate account circumvention non-accredited investor",
    collection_name="ForgeKYCAMLReports",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="enhanced due diligence digital asset crypto high risk jurisdiction China",
    collection_name="ForgeKYCAMLReports",
    limit=10
  )
  ```
---

# ForgeKYCAMLReports Search Skill

Vector search skill for Forge Global KYC/AML investigation reports and investor compliance case records.

## Purpose

Retrieve KYC/AML investigation reports, compliance case findings, risk dispositions,
SAR recommendations, and account action records from the ForgeKYCAMLReports Weaviate collection.

## Collection Content

- AML alert investigation reports (transaction threshold breaches, pattern analysis)
- Enhanced due diligence reports (proactive high-risk profile reviews)
- KYC failure cases (failed verifications, incomplete documentation)
- SAR filing recommendations with rationale
- Account suspension, restriction, and closure records
- OFAC/PEP/sanctions screening outcomes
- Source-of-wealth verification findings
- Control gap and systemic compliance issue findings

## Search Examples

- "Show all HIGH and CRITICAL risk investor cases"
- "Which investors had SAR filings recommended?"
- "Find cases involving source-of-wealth documentation failures"
- "What account actions were taken for KYC FAIL investors?"
- "Show OFAC name-match investigations and outcomes"
- "Which cases involve duplicate account creation to bypass KYC?"
- "Find enhanced due diligence cases for digital asset investors"
