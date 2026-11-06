---
skill_type: query_vector
mcp_servers:
  - name: weaviate_mcp
    transport: http
    url: "http://localhost:8001/mcp"

agent_instructions: |
  You are searching the AvaniExecMemos collection in Weaviate, which contains executive memos
  and leadership communications from Avani Lifestyle including CEO addresses, CFO board decks,
  CMO strategy memos, CDO digital reviews, and VP-level briefs.

  ## Available Tool
  - **retrieve_docs_from_collection**: Retrieve documents using hybrid search

  ## Tool Parameters
  - query: Your natural language search query
  - collection_name: ALWAYS use "AvaniExecMemos"
  - limit: Number of documents to retrieve (default 10, max 20)

  ## Search Strategy
  1. Use executive names, memo topics, or dates
  2. Use keywords like "board meeting", "CEO address", "leadership memo"
  3. Use role-specific terms: "CFO", "CMO", "CDO", "VP Stores", "VP Supply Chain"
  4. Start with limit=10, increase if more context is needed
  5. Review returned documents and extract relevant executive insights

  ## Important
  - ALWAYS set collection_name="AvaniExecMemos" when calling retrieve_docs_from_collection
  - Each document has a score indicating relevance (higher is better)
  - Cite the document content when providing executive insights
  - If no relevant memos are found, say so clearly
  - Maintain confidentiality when discussing executive communications

  ## Example Tool Calls
  ```
  retrieve_docs_from_collection(
    query="Q4 board meeting summary and financial results",
    collection_name="AvaniExecMemos",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="CEO strategy memo on DTC channel growth and wholesale decline",
    collection_name="AvaniExecMemos",
    limit=10
  )
  ```

  ```
  retrieve_docs_from_collection(
    query="supply chain crisis brief leggings stockout",
    collection_name="AvaniExecMemos",
    limit=15
  )
  ```
---

# AvaniExecMemos Search Skill

Vector search skill for Avani Lifestyle executive memos and leadership communications.

## Purpose

Retrieve executive memos, board presentations, strategy briefs, and leadership communications
from the AvaniExecMemos Weaviate collection.

## Collection Content

- CEO all-hands addresses and competitive intelligence memos
- CFO board presentation summaries and financial analyses
- CMO marketing strategy and channel reallocation proposals
- CDO digital business reviews and e-commerce performance reports
- VP Stores retail expansion cases and lease decision briefs
- VP Supply Chain crisis briefs and operational action plans
- Board meeting minutes with formal decisions and action items

## Search Examples

- "What did the CEO say about the Stride footwear launch failure?"
- "Find CFO analysis on DTC vs wholesale contribution margins"
- "Show CMO proposal for TikTok marketing reallocation"
- "What are the board's decisions on the SoHo lease?"
- "Find supply chain crisis brief for leggings stockout"
