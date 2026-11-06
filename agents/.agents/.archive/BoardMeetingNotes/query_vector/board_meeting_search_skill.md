---
name: BoardMeetingNotesSearch
description: Vector search over board meeting minutes and governance documentation using Weaviate
skill_type: query_vector

# Routing & Domain Classification
domain: documents
keywords:
  - documents
  - board meeting
  - minutes
  - resolution
  - governance
  - strategic planning
  - compliance
  - voting
  - action items
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
  You are searching the BoardMeetingNotes collection in Weaviate which contains comprehensive
  board meeting minutes, resolutions, and governance documentation.
  
  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search
  
  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "BoardMeetingNotes"
  - limit: Number of documents to retrieve (default 10, max 20)
  
  ## Search Strategy
  1. Use specific governance terms (e.g., "resolution", "vote", "strategic initiative", "compliance")
  2. Use meeting types: "board meeting", "committee meeting", "special session"
  3. Use topic areas: "financial oversight", "risk management", "executive compensation"
  4. For specific decisions: "approved", "rejected", "tabled", "action items"
  5. Start with limit=10, increase if more context is needed
  6. Review returned documents and extract relevant governance insights
  
  ## Important
  - ALWAYS set collection_name="BoardMeetingNotes"
  - Each document has a relevance score (higher = more relevant)
  - Cite specific documents when providing information about board decisions
  - Be precise with governance and decision information
  
  ## Document Categories
  - Meeting Minutes: Discussions, deliberations, voting records
  - Resolutions: Board decisions, approvals, policy changes
  - Strategic Planning: Business objectives, initiatives, priorities
  - Governance: Policies, procedures, compliance matters
  - Oversight: Financial reviews, risk assessments, audit reports
  
  ## Response Guidelines
  1. Search using the retrieve_docs_from_collection tool with collection_name="BoardMeetingNotes"
  2. Review document scores and content
  3. Extract and synthesize relevant governance insights
  4. Cite source documents clearly (including meeting dates if available)
  5. If no relevant documents found, state that explicitly
  6. Provide precise information about decisions and actions
---

## Skill: BoardMeetingNotesSearch

Vector search skill for retrieving board meeting minutes, resolutions, and governance documentation
from the BoardMeetingNotes Weaviate collection.

### Search Capabilities
- Board decision retrieval
- Strategic initiative tracking
- Governance policy search
- Voting record lookup
- Action item review

### Collection
- Name: BoardMeetingNotes
- Type: Vector database (Weaviate)
- Content: Board meeting minutes, resolutions, governance documentation

### Usage
The skill automatically searches the BoardMeetingNotes collection and returns
relevant documents based on the user's query about board decisions, strategic
initiatives, governance policies, or meeting discussions.
