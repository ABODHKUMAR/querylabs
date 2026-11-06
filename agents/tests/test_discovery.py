"""
Unit tests for querylab_agent.skills.discovery.

Uses a temporary directory as .agents root; no reliance on repo layout.
"""
import pytest
from pathlib import Path

from querylab_agent.skills.discovery import (
    KNOWN_SKILL_DIR_NAMES,
    SKILL_DIR_QUERY_SQL,
    SKILL_DIR_QUERY_VECTOR,
    discover_agents_and_skill_files,
    discover_agents_and_skills,
    get_default_agents_root,
    list_agents,
    list_skill_dirs_for_agent,
    list_skill_files_in_skill_dir,
)


@pytest.fixture
def discovery_root(tmp_path: Path) -> Path:
    """Create and return a path to .agents under tmp_path. Tests build agent/skill tree under this."""
    root = tmp_path / ".agents"
    root.mkdir()
    return root


# ---------------------------------------------------------------------------
# get_default_agents_root(reference_path=...)
# ---------------------------------------------------------------------------

def test_get_default_agents_root_reference_path_file_inside_agents_dir(tmp_path: Path) -> None:
    """reference_path is a file inside a dir that contains .agents -> returns that .agents path."""
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "domain").mkdir()
    deep_file = agents_dir / "domain" / "query_sql" / "SKILL.md"
    deep_file.parent.mkdir(parents=True)
    deep_file.write_text("test")
    result = get_default_agents_root(reference_path=deep_file)
    assert result == agents_dir.resolve()
    assert result.name == ".agents"


def test_get_default_agents_root_reference_path_several_levels_deep(tmp_path: Path) -> None:
    """reference_path is several levels under a dir that contains .agents -> walk up to find .agents."""
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    deep = agents_dir / "a" / "b" / "c" / "file.txt"
    deep.parent.mkdir(parents=True)
    deep.write_text("x")
    result = get_default_agents_root(reference_path=deep)
    assert result == agents_dir.resolve()
    assert result.name == ".agents"


def test_get_default_agents_root_returns_path_ending_with_agents() -> None:
    """When reference_path=None, result is a Path whose name is .agents."""
    result = get_default_agents_root(reference_path=None)
    assert result.name == ".agents"
    assert isinstance(result, Path)


# ---------------------------------------------------------------------------
# list_agents(base_path=...)
# ---------------------------------------------------------------------------

def test_list_agents_two_agent_dirs(discovery_root: Path) -> None:
    """base_path with two agent dirs (domain, sales) -> returns both names (order-independent)."""
    (discovery_root / "domain").mkdir()
    (discovery_root / "sales").mkdir()
    result = list_agents(base_path=discovery_root)
    assert sorted(result) == ["domain", "sales"]


def test_list_agents_one_dir_and_one_file(discovery_root: Path) -> None:
    """base_path with one agent dir and one file -> returns only the dir name."""
    (discovery_root / "domain").mkdir()
    (discovery_root / "readme.txt").write_text("x")
    result = list_agents(base_path=discovery_root)
    assert result == ["domain"]


def test_list_agents_excludes_hidden_dir(discovery_root: Path) -> None:
    """base_path with a hidden dir (.hidden) -> hidden dir is excluded."""
    (discovery_root / "domain").mkdir()
    (discovery_root / ".hidden").mkdir()
    result = list_agents(base_path=discovery_root)
    assert result == ["domain"]


def test_list_agents_nonexistent_path(tmp_path: Path) -> None:
    """base_path is a non-existent path -> returns []."""
    nonexistent = tmp_path / "does_not_exist"
    assert not nonexistent.exists()
    result = list_agents(base_path=nonexistent)
    assert result == []


def test_list_agents_empty_dir(discovery_root: Path) -> None:
    """base_path is an empty .agents dir -> returns []."""
    result = list_agents(base_path=discovery_root)
    assert result == []


# ---------------------------------------------------------------------------
# list_skill_dirs_for_agent(agent_name, base_path=...)
# ---------------------------------------------------------------------------

def test_list_skill_dirs_two_skills_with_skill_md(discovery_root: Path) -> None:
    """Agent dir with query_sql and query_vector both having SKILL.md -> returns both paths, sorted by name."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "SKILL.md").write_text("# sql")
    (discovery_root / "domain" / "query_vector").mkdir(parents=True)
    (discovery_root / "domain" / "query_vector" / "SKILL.md").write_text("# vector")
    result = list_skill_dirs_for_agent("domain", base_path=discovery_root)
    assert len(result) == 2
    assert [p.name for p in result] == ["query_sql", "query_vector"]
    assert {p.resolve() for p in result} == {
        (discovery_root / "domain" / "query_sql").resolve(),
        (discovery_root / "domain" / "query_vector").resolve(),
    }


def test_list_skill_dirs_only_known_constants_returned(discovery_root: Path) -> None:
    """Agent dir has query_sql (known) and other_dir (not known) -> returns only query_sql."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "other_dir").mkdir(parents=True)
    result = list_skill_dirs_for_agent("domain", base_path=discovery_root)
    assert len(result) == 1
    assert result[0].name == "query_sql"


def test_list_skill_dirs_agent_does_not_exist(discovery_root: Path) -> None:
    """Agent dir does not exist -> returns []."""
    result = list_skill_dirs_for_agent("nonexistent", base_path=discovery_root)
    assert result == []


def test_list_skill_dirs_agent_has_no_known_skill_dirs(discovery_root: Path) -> None:
    """Agent dir exists but no subdir is query_sql or query_vector -> returns []."""
    (discovery_root / "domain").mkdir()
    (discovery_root / "domain" / "empty_subdir").mkdir()
    result = list_skill_dirs_for_agent("domain", base_path=discovery_root)
    assert result == []


def test_list_skill_dirs_only_dirs_considered(discovery_root: Path) -> None:
    """Agent dir with only a file (no query_sql/query_vector dir) -> returns [] (no crash)."""
    (discovery_root / "domain").mkdir()
    (discovery_root / "domain" / "some_file.txt").write_text("x")
    result = list_skill_dirs_for_agent("domain", base_path=discovery_root)
    assert result == []


def test_discovery_constants() -> None:
    """Known skill dir names are defined and include query_sql and query_vector."""
    assert SKILL_DIR_QUERY_SQL == "query_sql"
    assert SKILL_DIR_QUERY_VECTOR == "query_vector"
    assert SKILL_DIR_QUERY_SQL in KNOWN_SKILL_DIR_NAMES
    assert SKILL_DIR_QUERY_VECTOR in KNOWN_SKILL_DIR_NAMES


# ---------------------------------------------------------------------------
# list_skill_files_in_skill_dir(skill_dir_path)
# ---------------------------------------------------------------------------

def test_list_skill_files_multiple_md(discovery_root: Path) -> None:
    """Skill dir with multiple .md files -> returns all, sorted by name."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "postgres_sales.md").write_text("# a")
    (discovery_root / "domain" / "query_sql" / "snowflake_analytics.md").write_text("# b")
    skill_dir = discovery_root / "domain" / "query_sql"
    result = list_skill_files_in_skill_dir(skill_dir)
    assert len(result) == 2
    assert [p.name for p in result] == ["postgres_sales.md", "snowflake_analytics.md"]


def test_list_skill_files_empty_dir(discovery_root: Path) -> None:
    """Skill dir with no .md files -> returns []."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    result = list_skill_files_in_skill_dir(discovery_root / "domain" / "query_sql")
    assert result == []


def test_list_skill_files_ignores_non_md(discovery_root: Path) -> None:
    """Skill dir with .txt and .md -> returns only .md."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "readme.txt").write_text("x")
    (discovery_root / "domain" / "query_sql" / "skill.md").write_text("# s")
    result = list_skill_files_in_skill_dir(discovery_root / "domain" / "query_sql")
    assert len(result) == 1
    assert result[0].name == "skill.md"


# ---------------------------------------------------------------------------
# discover_agents_and_skills(base_path=...)
# ---------------------------------------------------------------------------

def test_discover_two_agents_each_one_skill(discovery_root: Path) -> None:
    """Tree: domain/query_sql/SKILL.md, sales/query_sql/SKILL.md -> two entries."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "SKILL.md").write_text("# sql")
    (discovery_root / "sales" / "query_sql").mkdir(parents=True)
    (discovery_root / "sales" / "query_sql" / "SKILL.md").write_text("# sql")
    result = discover_agents_and_skills(base_path=discovery_root)
    assert len(result) == 2
    names = [r[0] for r in result]
    assert sorted(names) == ["domain", "sales"]
    for agent_name, skill_dirs in result:
        assert len(skill_dirs) == 1
        assert skill_dirs[0].name == "query_sql"


def test_discover_one_agent_two_skills(discovery_root: Path) -> None:
    """Tree: domain/query_sql/SKILL.md, domain/query_vector/SKILL.md -> one entry, two skill dirs sorted."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "SKILL.md").write_text("# sql")
    (discovery_root / "domain" / "query_vector").mkdir(parents=True)
    (discovery_root / "domain" / "query_vector" / "SKILL.md").write_text("# vector")
    result = discover_agents_and_skills(base_path=discovery_root)
    assert len(result) == 1
    agent_name, skill_dirs = result[0]
    assert agent_name == "domain"
    assert [p.name for p in skill_dirs] == ["query_sql", "query_vector"]


def test_discover_agent_with_no_known_skill_dirs_excluded(discovery_root: Path) -> None:
    """Agent with no query_sql/query_vector dir -> that agent is not in the result."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "a.md").write_text("# sql")
    (discovery_root / "empty_agent").mkdir()
    result = discover_agents_and_skills(base_path=discovery_root)
    assert len(result) == 1
    assert result[0][0] == "domain"


def test_discover_empty_agents_dir(discovery_root: Path) -> None:
    """Empty .agents dir -> returns []."""
    result = discover_agents_and_skills(base_path=discovery_root)
    assert result == []


# ---------------------------------------------------------------------------
# discover_agents_and_skill_files(base_path=...)
# ---------------------------------------------------------------------------

def test_discover_skill_files_two_agents(discovery_root: Path) -> None:
    """Each agent has query_sql with one .md -> two entries, each with query_sql: [path]."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "postgres.md").write_text("# sql")
    (discovery_root / "sales" / "query_sql").mkdir(parents=True)
    (discovery_root / "sales" / "query_sql" / "sales_db.md").write_text("# sql")
    result = discover_agents_and_skill_files(base_path=discovery_root)
    assert len(result) == 2
    names = sorted(r[0] for r in result)
    assert names == ["domain", "sales"]
    for agent_name, by_type in result:
        assert "query_sql" in by_type
        assert len(by_type["query_sql"]) == 1
        assert by_type["query_sql"][0].suffix == ".md"


def test_discover_skill_files_multiple_md_per_type(discovery_root: Path) -> None:
    """One agent, query_sql with two .md files -> one entry, query_sql has two paths."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "postgres.md").write_text("# a")
    (discovery_root / "domain" / "query_sql" / "snowflake.md").write_text("# b")
    result = discover_agents_and_skill_files(base_path=discovery_root)
    assert len(result) == 1
    assert result[0][0] == "domain"
    assert len(result[0][1]["query_sql"]) == 2
    assert {p.name for p in result[0][1]["query_sql"]} == {"postgres.md", "snowflake.md"}


def test_discover_skill_files_agent_with_skill_dir_but_no_md_excluded(discovery_root: Path) -> None:
    """Agent has query_sql dir but no .md files -> agent excluded from discover_agents_and_skill_files."""
    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "no_md_agent" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "a.md").write_text("# s")
    result = discover_agents_and_skill_files(base_path=discovery_root)
    assert len(result) == 1
    assert result[0][0] == "domain"


# ---------------------------------------------------------------------------
# A2A discovery (discover_agent_cards, get_agent_card)
# ---------------------------------------------------------------------------

def test_a2a_discover_agent_cards_returns_cards_for_agents_with_skills(discovery_root: Path) -> None:
    """discover_agent_cards uses file discovery and returns one AgentCard per agent with skills."""
    from querylab_agent.a2a.discovery import discover_agent_cards, get_agent_card

    (discovery_root / "domain" / "query_sql").mkdir(parents=True)
    (discovery_root / "domain" / "query_sql" / "postgres.md").write_text("---\nname: postgres\nskill_type: sql\n---\n# Postgres")
    cards = discover_agent_cards(base_path=discovery_root, base_url="http://test")
    assert len(cards) == 1
    assert cards[0]["name"] == "domain"
    assert cards[0]["url"] == "http://test/ask"
    assert len(cards[0]["skills"]) == 1
    assert cards[0]["skills"][0]["id"] == "domain:query_sql:postgres"
    assert cards[0]["skills"][0]["name"] == "postgres"

    one = get_agent_card("domain", base_path=discovery_root)
    assert one is not None
    assert one["name"] == "domain"
    one_missing = get_agent_card("nonexistent", base_path=discovery_root)
    assert one_missing is None
