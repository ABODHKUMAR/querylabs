---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the MVWOwnerFeedback collection in Weaviate, which contains owner
  satisfaction surveys, verbatim feedback, and CS agent notes for all 20 Marriott Vacations
  Worldwide owners across Presidential, Select, and Signature tiers.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "MVWOwnerFeedback"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use owner names directly (e.g., "Lisa Kowalski", "Mark Henderson", "James Patel")
  2. Use home resort names: "Sheraton PGA", "Vistana Villages", "Harbour Lake", "Westin Nanea"
  3. Use issue keywords: "spa closure", "renovation", "golf fees", "maintenance fee", "delinquent"
  4. Use tier terms: "Presidential", "Select", "Signature"
  5. Start with limit=10, increase if retrieving multiple owner profiles
  6. Review returned documents and extract specific grievances and CS agent context

  ## Important
  - ALWAYS set collection_name="MVWOwnerFeedback" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite owner verbatim content when providing retention or recovery recommendations
  - If no relevant feedback is found, say so clearly
  - Maintain strict confidentiality when discussing individual owner information

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="Lisa Kowalski Sheraton PGA spa closure delinquent maintenance fee grievance",
    collection_name="MVWOwnerFeedback",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Mark Henderson Sheraton Vistana renovation promise resort credit unresolved",
    collection_name="MVWOwnerFeedback",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="Presidential owner expansion interest Westin Nanea referral upgrade",
    collection_name="MVWOwnerFeedback",
    limit=15
  )
  ```
---

# MVWOwnerFeedback Search Skill

Vector search skill for Marriott Vacations Worldwide owner satisfaction surveys and CS feedback notes.

## Purpose

Retrieve owner satisfaction surveys, verbatim feedback, and customer success agent notes
from the MVWOwnerFeedback Weaviate collection, covering all 20 MVW owners across
Presidential, Select, and Signature ownership tiers.

## Collection Content

- Presidential owner verbatims — expansion interest, referral network intent, satisfaction drivers
- At-risk and delinquent Signature owner grievances — service failures, broken promises
- Select owner engagement levels — satisfaction factors and retention signals
- CS agent notes — relationship history, escalation flags, recovery context per owner
- Specific issue documentation: spa closure, renovation disruption, golf fee increases, unit reassignments
- Upgrade and growth signals: owners requesting different properties or expressing expansion interest

## Search Examples

- "What is Lisa Kowalski's specific grievance at Sheraton PGA?"
- "Find all owner feedback from Sheraton Vistana Villages about renovation disruption"
- "Show Mark Henderson's unresolved resort credit complaint"
- "Which Presidential owners have expressed interest in a Westin Nanea expansion?"
- "Find owner feedback about MVC Harbour Lake Disney competition and value concerns"
