# Light SQL ReAct agent and SKILL.md mechanism

## Idea

- **In-code tools**: only `generate_sql`, `fix_sql`, `evaluate_query` (reasoning).
- **From MCP**: discovery (`get_schema`, `get_table_details`) and execution (`execute_sql`).
- **SKILL.md** defines which MCP servers the skill uses and optional agent instructions.

## Flow

1. **Read SKILL.md**  
   `load_skill_config(skill_dir)` parses frontmatter and returns:
   - `name`, `description`
   - `mcp_servers`: list of server names (e.g. `["postgres_sales"]`)
   - `agent_instructions`: optional string added to the agent system prompt

2. **Resolve MCP configs**  
   Caller provides `mcp_config_resolver(mcp_server_names) -> list of MCP config dicts`.  
   So “which skill with which MCP” is: skill from SKILL.md, MCP from your registry/config.

3. **Build agent**  
   - In-code: `create_light_sql_tools(llm, db_type)` → generate_sql, fix_sql, evaluate_query.
   - MCP: `create_mcp_tools_async(mcp_configs)` → discovery + execute tools from MCP.
   - System prompt: base workflow + `skill_config.agent_instructions`.
   - `create_agent(model=llm, tools=light_tools + mcp_tools, system_prompt=...)`.

4. **Use**  
   Agent runs ReAct: typically get_schema (MCP) → generate_sql → execute_sql (MCP) → fix_sql if needed.

## SKILL.md format (query_sql)

```yaml
---
name: query_sql
description: ...
mcp_servers:
  - postgres_sales
agent_instructions: |
  Use only SELECT. Call get_schema first, then generate_sql with relevant_schema_details.
---
```

Optional: in the body, a `## Agent instructions` section is used if `agent_instructions` is not in frontmatter.

## Usage

```python
from querylab_agent.agents import create_sql_react_agent_from_skill, LightSQLReActAgent
from querylab_agent.llm import get_llm

def my_mcp_resolver(server_names):
    # Map server name -> MCP config (from env, registry, etc.)
    return [{"name": n, "transport": "stdio", "command": "npx", "args": ["-y", "mcp-server-postgres"]} for n in server_names]

llm = get_llm("openai")
agent = await create_sql_react_agent_from_skill(
    skill_dir="querylab_agent/skills/query_sql",
    llm=llm,
    mcp_config_resolver=my_mcp_resolver,
    db_type="postgres",
)
result = await agent.ainvoke({"messages": [("user", "Top 10 customers by revenue")]})
```

Or use the class:

```python
light_agent = LightSQLReActAgent(
    skill_dir="querylab_agent/skills/query_sql",
    llm=llm,
    mcp_config_resolver=my_mcp_resolver,
)
await light_agent.invoke("Top 10 customers by revenue")
```
