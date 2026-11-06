"""
Load environment variables from agents/.env at the project root.

The .env file is looked up at the agents package root (parent of querylab_agent),
e.g. d:/projects/querylab/agents/.env. Call load_env() at startup so OPENAI_API_KEY,
QUERYLAB_AGENTS_ROOT, etc. are available.

When DOCKER_RUNNING is set to true (e.g. by docker-compose), .env is not loaded;
use env_file / environment in compose instead.
"""
import os
from pathlib import Path


def get_project_root() -> Path:
    """
    Return the agents project root (directory containing querylab_agent and .env).
    E.g. .../querylab/agents when running from agents/.
    """
    p = Path(__file__).resolve().parent
    if p.name == "querylab_agent":
        return p.parent
    return p


def load_env(*, override: bool = False) -> bool:
    """
    Load .env from the project root (agents/.env). Does not override existing
    env vars unless override=True. Returns True if a file was loaded.
    Skips loading when DOCKER_RUNNING is true (env comes from compose).

    Looks for:
      - .env
      - .env.local (if present, loaded after .env so it can override)
    """
    if os.environ.get("DOCKER_RUNNING", "").strip().lower() in ("1", "true", "yes"):
        return False
    try:
        from dotenv import load_dotenv
    except ImportError:
        return False
    root = get_project_root()
    loaded = False
    for name in (".env", ".env.local"):
        path = root / name
        if path.is_file():
            load_dotenv(path, override=override)
            loaded = True
    return loaded
