# Default agent definitions (.agents)

This directory is the **default location** for agent and skill definitions.

## Layout

```
.agents/
  <agent_name>/              e.g. domain, sales, hr (one dir per agent)
    <skill_type_dir>/        only known dirs: query_sql, query_vector (constants)
      *.md                   any .md file = one skill instance (each with its own MCP)
```

- **Agent**: each top-level dir under `.agents/` is one agent.
- **Skill-type dirs**: we look only for **query_sql** and **query_vector** (constants). Other subdir names are ignored.
- **Skill files**: inside each skill-type dir, **any .md file** is one skill. Multiple .md files in `query_sql` = multiple SQL skills for that agent, each with its own MCP config in that file.

## Flow (executor / initializer)

1. **Discover agents**: list top-level dirs under `.agents/` → agent names.
2. **For each agent**: list only subdirs named **query_sql** or **query_vector** (known constants).
3. **Skill files**: inside each such dir, every `.md` file is one skill; load each and build the runner (e.g. one SQL ReAct agent per .md in query_sql).

Code: `discover_agents_and_skill_files()`, `build_agents_from_dot_agents()`, `load_agent_definition(agent_name)` in `querylab_agent.executor`.

## Example

- `.agents/domain/query_sql/postgres_sales.md` → one SQL skill (its own MCP).
- `.agents/domain/query_sql/snowflake_analytics.md` → second SQL skill for the same agent.
- `.agents/domain/query_vector/weaviate.md` → one vector skill.

## MCP server config (in the skill .md only)

Users add **mcp-server** details in the skill file itself. No separate JSON is required (optional JSON registry still supported for name lookup).

**Option 1 – frontmatter with full config (list of objects):**

```yaml
mcp_servers:
  - name: postgres_sales
    transport: stdio
    command: npx
    args: ["-y", "your-mcp-postgres-server"]
  - name: snowflake_analytics
    transport: stdio
    command: npx
    args: ["-y", "your-mcp-snowflake-server"]
```

**Option 2 – frontmatter with names only** (then supply a registry via `initialize_skills_and_agents(mcp_registry_path=...)` or `mcp_registry_dict={...}`):

```yaml
mcp_servers:
  - postgres_sales
  - snowflake_analytics
```

**Option 3 – ## MCP servers in the body:** add a `## MCP servers` section with a YAML or JSON fenced code block (e.g. ` ```yaml `) listing server configs. Same shape as option 1.

When the skill file defines full config (option 1 or 3), that is used. When it only lists names (option 2), the runtime resolves them from the optional JSON registry. See `mcp_servers.example.json` in this directory for the optional registry format.

MCP servers at repo root under `mcp_servers/`:
- **Weaviate** (`mcp_servers/weaviate_mcp`): **retrieve_docs_from_collection** (hybrid search). Add `weaviate_docs` to your skill's `mcp_servers`; run with cwd `mcp_servers/weaviate_mcp`.
- **MySQL** (`mcp_servers/mysql_mcp`): **get_schema** and **execute_sql** (same as querylab_sql). Add `mysql_analytics` (or your name) to your skill's `mcp_servers`; run with cwd `mcp_servers/mysql_mcp`.
