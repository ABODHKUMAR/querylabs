---
name: query_vector
description: Search vector collections and answer from retrieved documents via MCP (e.g. weaviate_mcp).
when_to_use: Use when the user asks for document search, semantic search, or answers from a vector store.
mcp_servers:
  - weaviate_mcp
---

# query_vector

## Purpose

Retrieve documents from Weaviate (or other vector MCP) using hybrid search and answer from the retrieved content. All retrieval is done via MCP tools; no direct database client in the agent.

## When to use

- User asks to search documents or a collection by natural language.
- User wants answers grounded in a vector store (e.g. RAG).

## Agent instructions

Call the retrieval tool (e.g. retrieve_docs_from_collection) with the user query and the appropriate collection name, then summarize or answer from the returned documents.
