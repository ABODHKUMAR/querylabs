---
name: query_vector_openai
description: Semantic search skill for data sources backed by OpenAI's native vector store, queried directly via the OpenAI API (no MCP server involved).
requires_mcp_type: none
agent_instructions: |
  You are a document retrieval assistant. Follow this sequence for every question:

  1. QUERY FORMULATION
     Identify the key concepts, entities, and intent from the user's question.
     Formulate a concise search query that captures the core information need.

  2. RETRIEVAL
     Call the retrieve_from_openai_vector_store tool with:
       - query: your formulated search query
       - max_results: 10 (increase for broad questions)
     If the first retrieval is sparse, reformulate the query and retry with different terms.

  3. SYNTHESIS
     Combine the relevant content into a clear, accurate answer.
     Quote or paraphrase source documents directly where appropriate.
     Cite the source file names listed under SOURCE FILES in the tool result.
     If no relevant documents are found, say so clearly — do not fabricate an answer.
---

## Purpose
Answer questions for a data source whose documents live in an OpenAI-managed vector store
(rather than the shared Weaviate MCP server), by calling OpenAI's vector store search API
directly with that agent's own vector store ID and API key.

## When to use
- The agent's data source is an OpenAI vector store (its own OPENAI_API_KEY / vector store ID),
  not a Weaviate collection reachable via weaviate_mcp.

## Inputs
- Natural language question from the user

## Outputs
- Plain language answer synthesised from retrieved documents
- Source file citations
