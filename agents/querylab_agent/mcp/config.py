"""
Load MCP server registry from JSON and build a config resolver for skills.

JSON format can be:
- A list of server configs: [{"name": "postgres_sales", "transport": "stdio", "command": "npx", "args": ["-y", "mcp-server"]}, ...]
- A dict keyed by server name: {"postgres_sales": {"name": "postgres_sales", "transport": "stdio", ...}, ...}
"""
import json
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union


def load_mcp_registry_from_json(
    source: Union[str, Path, Dict[str, Any], List[Dict[str, Any]]],
) -> Dict[str, Dict[str, Any]]:
    """
    Load MCP server registry from a JSON file or a dict/list.

    - If source is a path: read JSON from file. File can be:
      - A list of configs: [{"name": "x", "transport": "...", ...}, ...]
      - A dict: {"server_name": {"name": "server_name", "transport": "...", ...}, ...}
    - If source is a dict: expect {"server_name": config_dict, ...}.
    - If source is a list: expect [config_dict, ...]; each config must have "name".

    Returns:
        Dict mapping server name -> config dict (always has "name" key).
    """
    if isinstance(source, (str, Path)):
        path = Path(source)
        if not path.exists():
            return {}
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
    else:
        data = source

    if isinstance(data, list):
        out: Dict[str, Dict[str, Any]] = {}
        for item in data:
            if not isinstance(item, dict):
                continue
            name = item.get("name") or item.get("server_name")
            if name:
                out[str(name)] = {**item, "name": str(name)}
        return out
    if isinstance(data, dict):
        out = {}
        for k, v in data.items():
            if isinstance(v, dict):
                out[str(k)] = {**v, "name": v.get("name", k)}
        return out
    return {}


def get_all_servers(registry: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return all MCP server configs as a list (for API discovery)."""
    return list(registry.values())


def filter_servers_by_type(
    registry: Dict[str, Dict[str, Any]],
    mcp_type: str,
) -> List[Dict[str, Any]]:
    """Return MCP server configs whose 'type' field matches mcp_type (e.g. 'sql', 'vector')."""
    return [v for v in registry.values() if v.get("type") == mcp_type]


def make_mcp_config_resolver(
    registry: Dict[str, Dict[str, Any]],
) -> Callable[[List[str]], List[Dict[str, Any]]]:
    """
    Build a callable that resolves MCP server names (from skill's mcp_servers) to config dicts.

    Skills reference servers by name in their .md (e.g. mcp_servers: [postgres_sales]).
    The resolver looks up each name in the registry and returns a list of configs for
    create_mcp_tools_async. Missing names are skipped (no error).
    """
    def resolver(server_names: List[str]) -> List[Dict[str, Any]]:
        return [registry[n] for n in server_names if n in registry]
    return resolver
