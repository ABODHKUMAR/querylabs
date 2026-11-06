# Test plan: discovery module (finalize before coding)

## Scope

**Module under test:** `querylab_agent.skills.discovery`

**Functions to test:**

| Function | Purpose |
|----------|--------|
| `get_default_agents_root(reference_path=None)` | Returns path to `.agents` (from reference_path, package location, or cwd) |
| `list_agents(base_path=None)` | Lists top-level dir names under `.agents` (agent names) |
| `list_skill_dirs_for_agent(agent_name, base_path=None)` | Lists subdirs of `.agents/<agent_name>/` that contain `SKILL.md` |
| `discover_agents_and_skills(base_path=None)` | Returns `[(agent_name, [skill_dir, ...]), ...]` for all agents with at least one skill |

---

## Strategy

- **No reliance on real `.agents`:** Use a **temporary directory** as `base_path` so tests are deterministic and don’t depend on repo layout.
- **Isolate `get_default_agents_root`:** When `reference_path` is given, only the “walk up to find .agents” behaviour is tested. When not given, we either pass an explicit `base_path` into other functions or accept that the default may be repo’s real `.agents` (and document that).
- **Fixtures:** Create a small tree under `tmp_path` (pytest built-in) mimicking `.agents/agent_name/skill_name/SKILL.md`.

---

## Test layout

- **Location:** `agents/tests/` (same level as `querylab_agent/`).
- **File:** `agents/tests/test_discovery.py`.
- **Runner:** pytest. Add `pytest` to `[tool.poetry.group.dev.dependencies]` in `pyproject.toml`.

---

## Cases to cover

### 1. `get_default_agents_root(reference_path=...)`

| # | Case | Behaviour |
|---|------|-----------|
| 1.1 | `reference_path` is a file inside a dir that contains `.agents` | Returns that `.agents` path (resolved). |
| 1.2 | `reference_path` is a path several levels under a dir that contains `.agents` | Returns that `.agents` path (walk up). |
| 1.3 | `reference_path` is given but no parent has `.agents` | Falls through to package/cwd logic; we can either assert “returns something that ends in .agents” or skip when not in repo. |
| 1.4 | `reference_path=None` | Returns package’s `.agents` or cwd’s `.agents` (no temp dir; optional test or document as integration-style). |

**Proposal:** Implement **1.1** and **1.2** with a temp `.agents` dir. For 1.4, either a single test “returns a Path ending in `.agents`” or leave for manual check.

### 2. `list_agents(base_path=...)`

| # | Case | Behaviour |
|---|------|-----------|
| 2.1 | `base_path` is a dir with two agent dirs (`domain`, `sales`) | Returns `["domain", "sales"]` (order may vary; sort in assertion). |
| 2.2 | `base_path` is a dir with one agent dir and one file | Returns only the dir name (e.g. `["domain"]`). |
| 2.3 | `base_path` is a dir with a hidden dir (e.g. `.hidden`) | Hidden dir is excluded (name starts with `.`). |
| 2.4 | `base_path` is a non-existent path | Returns `[]`. |
| 2.5 | `base_path` is an empty dir | Returns `[]`. |

### 3. `list_skill_dirs_for_agent(agent_name, base_path=...)`

| # | Case | Behaviour |
|---|------|-----------|
| 3.1 | Agent dir exists with two skill dirs that have `SKILL.md` (`query_sql`, `query_vector`) | Returns both paths, sorted by name. |
| 3.2 | Agent dir has one subdir with `SKILL.md` and one without | Returns only the dir that contains `SKILL.md`. |
| 3.3 | Agent dir does not exist | Returns `[]`. |
| 3.4 | Agent dir exists but has no subdirs with `SKILL.md` | Returns `[]`. |
| 3.5 | Agent dir has a subdir that is a file (shouldn’t happen in practice) | Only dirs are considered; no crash. |

### 4. `discover_agents_and_skills(base_path=...)`

| # | Case | Behaviour |
|---|------|-----------|
| 4.1 | Tree: `domain/query_sql/SKILL.md`, `sales/query_sql/SKILL.md` | Returns two entries: `("domain", [path_to_query_sql])`, `("sales", [path_to_query_sql])`. |
| 4.2 | Tree: `domain/query_sql/SKILL.md`, `domain/query_vector/SKILL.md` | One entry: `("domain", [path_sql, path_vector])` (sorted by skill dir name). |
| 4.3 | Tree: one agent dir with no skill dirs (no `SKILL.md`) | That agent is **not** in the result (only agents with ≥1 skill dir). |
| 4.4 | Empty `.agents` dir | Returns `[]`. |

---

## Fixture (shared)

- **`discovery_root(tmp_path)`:** Create under `tmp_path` a directory named `.agents` and return its path. Tests then create under this path:
  - `domain/`, `sales/`, etc.
  - `domain/query_sql/SKILL.md`, etc.
- So `base_path` in tests is `tmp_path / ".agents"` (or we use `tmp_path` as the “root” that contains `.agents` and pass `tmp_path / ".agents"` as `base_path`). **Choice:** Either:
  - **A)** `discovery_root` = `tmp_path / ".agents"` and we build `discovery_root / "domain" / "query_sql" / "SKILL.md"`, and pass `base_path=discovery_root` to all discovery functions, or
  - **B)** `discovery_root` = `tmp_path` and we create `tmp_path / ".agents" / "domain" / ...` and pass `base_path=tmp_path / ".agents"`.

**Proposal:** **A)** Use a fixture that returns `tmp_path / ".agents"` and create agent/skill tree under it; pass this as `base_path` everywhere. That matches “.agents is the root we pass to discovery”.

---

## Dependencies

- Add **pytest** to dev dependencies in `pyproject.toml` (and optionally **pytest-cov** if we want coverage later).

---

## Summary for your approval

1. **Location:** `agents/tests/test_discovery.py`.
2. **Tool:** pytest; dev dependency in pyproject.
3. **Isolation:** Temp dir created per test (or shared fixture) with a small `.agents`-style tree; no reliance on repo’s real `.agents`.
4. **Coverage:** All four discovery functions; edge cases: missing dirs, empty dirs, hidden dirs, “agent with no skills” excluded from `discover_agents_and_skills`.
5. **`get_default_agents_root`:** Test with `reference_path` pointing inside a temp tree that contains `.agents` (1.1, 1.2); optional simple test for `reference_path=None`.

If you confirm this plan (or suggest changes), next step is to add pytest and implement `tests/test_discovery.py` accordingly.
