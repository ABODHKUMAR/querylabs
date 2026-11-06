#!/usr/bin/env bash
# =============================================================================
# generate-local-env.sh
# Creates local .env* files for Docker Compose using YOUR MySQL (in compose)
# and placeholders for OpenAI / Weaviate. Secrets stay on disk, never in git.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-querylab}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-querylab_pass}"
SECRET_KEY="${SECRET_KEY:-querylab-change-me-secret}"
OPENAI_API_KEY="${OPENAI_API_KEY:-sk-your-openai-key}"
WEAVIATE_HOST="${WEAVIATE_HOST:-weaviate}"
WEAVIATE_PORT="${WEAVIATE_PORT:-8080}"
WEAVIATE_API_KEY="${WEAVIATE_API_KEY:-querylab-weaviate-key}"
VM_IP="${VM_IP:-15.207.111.124}"

cat > .env.agent <<EOF
# Local Query Labs — do not commit
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=gpt-4o-mini
QUERYLAB_AGENTS_LOG_LEVEL=INFO
QUERYLAB_AGENTS_LOG_FORMAT=json
LANGSMITH_TRACING=false
EOF

cat > .env.orchestrator <<EOF
# Local Query Labs — do not commit
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=gpt-4o-mini
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
BACKEND_DB_HOST=${MYSQL_HOST}
BACKEND_DB_PORT=${MYSQL_PORT}
BACKEND_DB_USER=${MYSQL_USER}
BACKEND_DB_PASSWORD=${MYSQL_PASSWORD}
BACKEND_DB_DATABASE=querylab_auth
QUERYLAB_AGENTS_API_URL=http://agents:8000
ORCHESTRATOR_LOG_FORMAT=json
EOF

write_mysql_env () {
  local file="$1"
  local database="$2"
  cat > "$file" <<EOF
# Local Query Labs — do not commit
MYSQL_HOST=${MYSQL_HOST}
MYSQL_PORT=${MYSQL_PORT}
MYSQL_USER=${MYSQL_USER}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
MYSQL_DATABASE=${database}
MCP_HOST=0.0.0.0
MCP_PORT=8000
MCP_TRANSPORT=streamable-http
MCP_LOG_LEVEL=INFO
EOF
}

write_mysql_env .env.revenue.mcp financial_metrics
write_mysql_env .env.beat.mcp beat_results_dev
write_mysql_env .env.meridian.mcp meridian_ventures
write_mysql_env .env.novadash.mcp novadash
write_mysql_env .env.avani.mcp avani
write_mysql_env .env.mvw.mcp mvw
write_mysql_env .env.pe_trading.mcp pe_trading_db

cat > .env.weaviate.mcp <<EOF
# Local Query Labs — do not commit
WEAVIATE_HOST=${WEAVIATE_HOST}
WEAVIATE_PORT=${WEAVIATE_PORT}
WEAVIATE_API_KEY=${WEAVIATE_API_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
WEAVIATE_EMBEDDING_MODEL=text-embedding-3-small
MCP_HOST=0.0.0.0
MCP_PORT=8001
MCP_TRANSPORT=streamable-http
MCP_LOG_LEVEL=INFO
DOCKER_RUNNING=true
EOF

cat > .env.mysql <<EOF
# Used by docker-compose mysql service
MYSQL_ROOT_PASSWORD=querylab_root
MYSQL_USER=${MYSQL_USER}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
MYSQL_DATABASE=querylab_auth
EOF

echo "Wrote local env files in $ROOT_DIR"
echo "  MySQL host inside Docker: ${MYSQL_HOST}"
echo "  Login user: admin@querylab.com / admin123"
echo "  Set a real key before starting agents:"
echo "    OPENAI_API_KEY=sk-... $0"
echo "  Frontend expects VM IP: ${VM_IP}"
