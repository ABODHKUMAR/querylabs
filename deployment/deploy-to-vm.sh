#!/bin/bash

# ============================================================================
# Query Labs VM Deployment Script
# ============================================================================
# This script automates deployment to a GCP VM
# Usage: ./deploy-to-vm.sh
# ============================================================================

set -e  # Exit on any error

# Configuration
VM_IP="15.207.111.124"
VM_USER="${VM_USER:-$(whoami)}"  # Use current user or set VM_USER env var
DEPLOY_DIR="/opt/querylab"
GIT_BRANCH="${GIT_BRANCH:-main}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# Functions
# ============================================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_env_var() {
    local var_name=$1
    if [ -z "${!var_name}" ]; then
        log_error "Environment variable $var_name is not set"
        exit 1
    fi
}

# ============================================================================
# Pre-deployment checks
# ============================================================================

log_info "Starting pre-deployment checks..."

# Check required environment variables
log_info "Checking required environment variables..."
check_env_var "OPENAI_API_KEY"
check_env_var "SECRET_KEY"
check_env_var "BACKEND_DB_PASSWORD"
check_env_var "WEAVIATE_API_KEY"

# Optional but recommended
if [ -z "$LANGSMITH_API_KEY" ]; then
    log_warn "LANGSMITH_API_KEY not set (optional)"
fi

# Check SSH connectivity
log_info "Testing SSH connection to VM..."
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${VM_USER}@${VM_IP}" "echo 'SSH OK'" > /dev/null 2>&1; then
    log_error "Cannot connect to VM at ${VM_IP}"
    log_error "Make sure:"
    log_error "  1. VM is running"
    log_error "  2. Your SSH key is configured"
    log_error "  3. Firewall allows SSH (port 22)"
    exit 1
fi
log_info "SSH connection successful"

# ============================================================================
# Deploy to VM
# ============================================================================

log_info "Deploying to VM: ${VM_IP}"

# Create deployment script that will run on VM
cat > /tmp/deploy-remote.sh <<'REMOTE_SCRIPT'
#!/bin/bash
set -e

DEPLOY_DIR="/opt/querylab"

echo "[INFO] Creating deployment directory..."
sudo mkdir -p "$DEPLOY_DIR"
sudo chown $(whoami):$(whoami) "$DEPLOY_DIR"

echo "[INFO] Checking if Docker is installed..."
if ! command -v docker &> /dev/null; then
    echo "[WARN] Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $(whoami)
    
    echo "[INFO] Installing Docker Compose plugin..."
    sudo apt-get install -y docker-compose-plugin
    
    echo "[WARN] Docker installed. Please logout/login and run this script again."
    exit 1
fi

echo "[INFO] Checking if repository exists..."
cd "$DEPLOY_DIR"

if [ ! -d ".git" ]; then
    echo "[ERROR] Repository not found at $DEPLOY_DIR"
    echo "[ERROR] Please clone the repository first:"
    echo "[ERROR]   cd $DEPLOY_DIR && git clone YOUR_REPO_URL ."
    exit 1
fi

echo "[INFO] Pulling latest code from git..."
git fetch origin
git checkout $GIT_BRANCH
git pull origin $GIT_BRANCH

echo "[INFO] Deployment directory ready"
REMOTE_SCRIPT

# Copy and execute remote script
log_info "Setting up VM environment..."
scp -o StrictHostKeyChecking=no /tmp/deploy-remote.sh "${VM_USER}@${VM_IP}:/tmp/"
ssh -o StrictHostKeyChecking=no "${VM_USER}@${VM_IP}" "chmod +x /tmp/deploy-remote.sh && GIT_BRANCH=$GIT_BRANCH /tmp/deploy-remote.sh"

# ============================================================================
# Create environment files on VM
# ============================================================================

log_info "Creating environment files..."

# Create .env.agent
log_info "Creating .env.agent..."
ssh "${VM_USER}@${VM_IP}" "cat > ${DEPLOY_DIR}/.env.agent" <<EOF
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=gpt-4o-mini

# Langsmith (optional)
LANGSMITH_TRACING=${LANGSMITH_TRACING:-true}
LANGSMITH_ENDPOINT=${LANGSMITH_ENDPOINT:-https://api.smith.langchain.com}
LANGSMITH_API_KEY=${LANGSMITH_API_KEY}
LANGSMITH_PROJECT=${LANGSMITH_PROJECT:-querylab-prod}
EOF

# Create .env.orchestrator
log_info "Creating .env.orchestrator..."
ssh "${VM_USER}@${VM_IP}" "cat > ${DEPLOY_DIR}/.env.orchestrator" <<EOF
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=gpt-4o-mini

# Authentication
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Backend Database (for user auth)
BACKEND_DB_HOST=${BACKEND_DB_HOST:-mysql}
BACKEND_DB_USER=${BACKEND_DB_USER:-querylab}
BACKEND_DB_PASSWORD=${BACKEND_DB_PASSWORD}
BACKEND_DB_DATABASE=${BACKEND_DB_DATABASE:-querylab_auth}
BACKEND_DB_PORT=${BACKEND_DB_PORT:-3306}

ORCHESTRATOR_RELOAD=false
ORCHESTRATOR_LOG_LEVEL=INFO
EOF

# Create .env.revenue.mcp
log_info "Creating .env.revenue.mcp..."
ssh "${VM_USER}@${VM_IP}" "cat > ${DEPLOY_DIR}/.env.revenue.mcp" <<EOF
MYSQL_HOST=${REVENUE_MYSQL_HOST:-mysql}
MYSQL_PORT=${REVENUE_MYSQL_PORT:-3306}
MYSQL_USER=${REVENUE_MYSQL_USER:-querylab}
MYSQL_PASSWORD=${REVENUE_MYSQL_PASSWORD:-$BACKEND_DB_PASSWORD}
MYSQL_DATABASE=${REVENUE_MYSQL_DATABASE:-financial_metrics}

MCP_HOST=0.0.0.0
MCP_PORT=8000
MCP_LOG_LEVEL=INFO
EOF

# Create .env.beat.mcp
log_info "Creating .env.beat.mcp..."
ssh "${VM_USER}@${VM_IP}" "cat > ${DEPLOY_DIR}/.env.beat.mcp" <<EOF
MYSQL_HOST=${BEAT_MYSQL_HOST:-mysql}
MYSQL_PORT=${BEAT_MYSQL_PORT:-3306}
MYSQL_USER=${BEAT_MYSQL_USER:-querylab}
MYSQL_PASSWORD=${BEAT_MYSQL_PASSWORD:-$BACKEND_DB_PASSWORD}
MYSQL_DATABASE=${BEAT_MYSQL_DATABASE:-beat_results_dev}

MCP_HOST=0.0.0.0
MCP_PORT=8000
MCP_LOG_LEVEL=INFO
EOF

# Create .env.meridian.mcp
log_info "Creating .env.meridian.mcp..."
ssh "${VM_USER}@${VM_IP}" "cat > ${DEPLOY_DIR}/.env.meridian.mcp" <<EOF
MYSQL_HOST=${MERIDIAN_MYSQL_HOST:-mysql}
MYSQL_PORT=${MERIDIAN_MYSQL_PORT:-3306}
MYSQL_USER=${MERIDIAN_MYSQL_USER:-querylab}
MYSQL_PASSWORD=${MERIDIAN_MYSQL_PASSWORD:-$BACKEND_DB_PASSWORD}
MYSQL_DATABASE=${MERIDIAN_MYSQL_DATABASE:-meridian_ventures}

MCP_HOST=0.0.0.0
MCP_PORT=8000
MCP_LOG_LEVEL=INFO
EOF

# Create .env.weaviate.mcp
log_info "Creating .env.weaviate.mcp..."
ssh "${VM_USER}@${VM_IP}" "cat > ${DEPLOY_DIR}/.env.weaviate.mcp" <<EOF
WEAVIATE_HOST=${WEAVIATE_HOST:-weaviate}
WEAVIATE_PORT=${WEAVIATE_PORT:-8080}
WEAVIATE_API_KEY=${WEAVIATE_API_KEY:-querylab-weaviate-key}

OPENAI_API_KEY=${OPENAI_API_KEY}
WEAVIATE_EMBEDDING_MODEL=text-embedding-3-small

MCP_HOST=0.0.0.0
MCP_PORT=8001
MCP_LOG_LEVEL=INFO
DOCKER_RUNNING=true
EOF

log_info "Environment files created successfully"

# ============================================================================
# Build and start services
# ============================================================================

log_info "Building and starting Docker services..."

ssh "${VM_USER}@${VM_IP}" <<'REMOTE_DEPLOY'
cd /opt/querylab

echo "[INFO] Stopping existing services..."
docker compose down 2>/dev/null || true

echo "[INFO] Building images (this may take 5-10 minutes)..."
docker compose build

echo "[INFO] Starting services..."
docker compose up -d

echo "[INFO] Waiting for services to be healthy..."
sleep 10

echo "[INFO] Container status:"
docker compose ps

echo "[INFO] Checking agents discovery..."
docker compose logs agents | grep "Built.*agent" || true

echo "[INFO] Deployment complete!"
REMOTE_DEPLOY

# ============================================================================
# Post-deployment verification
# ============================================================================

log_info "Running post-deployment checks..."

# Wait for services to stabilize
sleep 5

# Check agents API
log_info "Testing Agents API..."
if ssh "${VM_USER}@${VM_IP}" "curl -s http://localhost:8000/health" | grep -q "ok"; then
    log_info "✓ Agents API is healthy"
else
    log_warn "⚠ Agents API health check failed"
fi

# Check orchestrator API
log_info "Testing Orchestrator API..."
if ssh "${VM_USER}@${VM_IP}" "curl -s http://localhost:8084/api/data_source/" | grep -q "\["; then
    log_info "✓ Orchestrator API is responding"
else
    log_warn "⚠ Orchestrator API check failed"
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "============================================================================"
log_info "Deployment completed successfully!"
echo "============================================================================"
echo ""
echo "Services are available at:"
echo "  Frontend:     http://${VM_IP}:5174"
echo "  API:          http://${VM_IP}:8084"
echo "  Agents:       http://${VM_IP}:8000"
echo ""
echo "To view logs:"
echo "  ssh ${VM_USER}@${VM_IP} 'cd ${DEPLOY_DIR} && docker compose logs -f'"
echo ""
echo "To check service status:"
echo "  ssh ${VM_USER}@${VM_IP} 'cd ${DEPLOY_DIR} && docker compose ps'"
echo ""
echo "============================================================================"
