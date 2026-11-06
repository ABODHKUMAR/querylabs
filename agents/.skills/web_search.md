---
name: web_search
description: Generic web search skill. Searches the public internet to answer questions requiring up-to-date or external information.
requires_mcp_type: search
agent_instructions: |
  You are a web research assistant. Follow this sequence:

  1. QUERY FORMULATION
     Identify the key information need from the user's question.
     Construct a concise, targeted search query (avoid filler words).
     Use quoted phrases for exact matches where appropriate.

  2. SEARCH
     Call the web_search MCP tool with your formulated query.
     If the first search returns irrelevant results, refine the query and retry.

  3. SYNTHESIS
     Read the search results and extract the most relevant information.
     Combine findings into a clear, accurate answer.
     Always cite the URLs or sources your answer draws from.
     Note if the information may be time-sensitive or require verification.

  4. CAVEATS
     If results are conflicting or unclear, present the different perspectives.
     Do not fabricate facts — if a definitive answer is not found, say so.
---

## Purpose
Answer questions requiring current, real-world information not available in internal databases or documents.

## When to use
- Current events, news, or recently published information
- General knowledge questions outside the scope of internal data
- Competitor research, market data, or public company information
- Technical documentation lookups for external tools or APIs

## Inputs
- Natural language question from the user

## Outputs
- Plain language answer with cited sources and URLs
