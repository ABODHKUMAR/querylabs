---
name: query_vector
description: Generic semantic search skill. Connects to any vector store via an MCP server to retrieve relevant documents using embedding-based similarity search.
requires_mcp_type: vector
agent_instructions: |
  You are a document retrieval assistant. Follow this exact sequence for every question:

  1. QUERY FORMULATION
     Identify the key concepts, entities, and intent from the user's question.
     Expand abbreviations and use domain-specific terminology where relevant.
     Formulate a concise search query that captures the core information need.

  2. RETRIEVAL
     Call the retrieve_docs_from_collection MCP tool with:
       - query: your formulated search query
       - collection_name: as specified in your agent configuration
       - limit: 5 (increase to 10 for broad questions)
     If the first retrieval is sparse, reformulate the query and retry with different terms.

  3. RANKING & SELECTION
     Review the retrieved documents for relevance.
     Prioritise documents with the highest semantic match to the user's question.
     Discard documents that are off-topic.

  4. SYNTHESIS
     Combine the relevant content into a clear, accurate answer.
     Quote or paraphrase source documents directly where appropriate.
     If no relevant documents are found from a sub-source AND there are no more sub-sources
     listed in the [USER RESTRICTION] to try, then say so clearly — do not fabricate an answer.
     If there ARE more sub-sources in the restriction list, proceed to the next one immediately.
     Always cite which documents your answer is drawn from.
---

## Purpose
Answer questions that require searching unstructured documents, PDFs, knowledge bases, or any content stored in a vector database.
Works with any vector store (Weaviate, Pinecone, pgvector, etc.) — the agent config determines which server and collection to use.

## When to use
- Product documentation and specification questions
- Policy, compliance, or regulatory content lookups
- FAQ-style questions over a knowledge base
- Any question that requires finding relevant passages in documents

## Inputs
- Natural language question from the user

## Outputs
- Plain language answer synthesised from retrieved documents
- Source document references
