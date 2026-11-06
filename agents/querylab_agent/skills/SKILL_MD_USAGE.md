# Using SKILL.md fully

We use the **full** SKILL.md document: frontmatter and body sections drive config, prompts, and the executor.

## Parsed and used

| Source | Field / section | Where it’s used |
|--------|-----------------|-----------------|
| **Frontmatter** | `name` | Skill identity, logging |
| | `description` | Agent system prompt (via `prompt_context()`), routing hints |
| | `skill_type` | Executor: which runner to create (e.g. `sql` → light SQL ReAct agent) |
| | `mcp_servers` | MCP tool resolution for discovery/execution |
| | `agent_instructions` | Agent system prompt (instructions block) |
| **Body** | `## Purpose` | Agent system prompt (via `prompt_context()`) |
| | `## When to use` | Agent system prompt; can drive orchestrator routing |
| | `## Inputs` | `SkillConfig.inputs_summary` (validation/docs later) |
| | `## Outputs` | `SkillConfig.outputs_summary` (validation/docs later) |
| | `## Agent instructions` | Fallback if not in frontmatter |

- **`SkillConfig.prompt_context()`** builds one block from description + purpose + when_to_use for the agent.
- **`skill_type`** (or dir name like `query_sql`) is used by **`create_skill_runner()`** to pick the right runner (e.g. SQL ReAct for `sql` / `query_sql`).

## Optional later use

- **Inputs/Outputs**: validate request/response or generate tool descriptions.
- **When to use**: pass to orchestrator for “when to route to this skill” hints.
- **Examples** (if we add `## Examples`): few-shot examples in the prompt.

## Section headers

Body sections can have an optional suffix in parentheses, e.g. `## Inputs (from agent)`; the loader still treats them as Inputs/Outputs.
