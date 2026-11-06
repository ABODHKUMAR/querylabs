# Quick Start - Deploy Query Labs to VM in 5 Steps

**This guide covers manual deployment using the automated script.**

For **automated CI/CD deployment** with Bitbucket Pipelines, see [BITBUCKET_SETUP.md](BITBUCKET_SETUP.md) instead.

---

## Prerequisites
- Fresh GCP VM at 15.207.111.124 (Ubuntu 20.04/22.04)
- SSH key configured for VM access
- Git repository already cloned to `/opt/querylab` on VM

---

## Step 1: Configure SSH Access (One-time)

```bash
# Test SSH connection to your VM
ssh YOUR_USERNAME@15.207.111.124

# If this fails, set up your SSH key:
ssh-keygen -t rsa -b 4096
ssh-copy-id YOUR_USERNAME@15.207.111.124
```

---

## Step 2: Clone Repository on VM (One-time)

```bash
# SSH into VM
ssh YOUR_USERNAME@15.207.111.124

# Install Docker if not present
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt-get install -y docker-compose-plugin

# Logout and login again
exit

# SSH back in
ssh YOUR_USERNAME@15.207.111.124

# Clone repository
sudo mkdir -p /opt/querylab
sudo chown $USER:$USER /opt/querylab
cd /opt/querylab
git clone YOUR_REPO_URL .

# Exit VM
exit
```

---

## Step 3: Configure Environment Variables

```bash
# On your local machine in "deployment" folder
cd "h:/project_querylabs/querylab/deployment"

# Copy template and edit with your values
cp env.template .env.deploy
code .env.deploy  # Or use notepad, vim, etc.

# Fill in at minimum these required values:
# - OPENAI_API_KEY
# - SECRET_KEY (use same as local: querylab-change-me-secret)
# - BACKEND_DB_PASSWORD
# - WEAVIATE_API_KEY
# - VM_USER (your SSH username)
```

---

## Step 4: Deploy to VM

```bash
# Source environment variables
source .env.deploy

# Make script executable
chmod +x deploy-to-vm.sh

# Run deployment
./deploy-to-vm.sh
```

The script will:
- Test SSH connection
- Create all .env files on VM
- Pull latest code from git
- Build Docker images
- Start all services
- Run health checks

**Takes about 5-10 minutes** (mostly Docker build time).

---

## Step 5: Verify Deployment

Open in browser:
- **Frontend**: http://15.207.111.124:5174
- **API**: http://15.207.111.124:8084/api/data_source/

Or check from command line:
```bash
# SSH to VM and check
ssh YOUR_USERNAME@15.207.111.124

cd /opt/querylab

# View running containers
docker compose ps

# View logs
docker compose logs -f agents
docker compose logs -f orchestrator

# Run health check
curl http://localhost:8000/health
curl http://localhost:8084/api/data_source/
```

---

## Troubleshooting

### Build fails
```bash
# SSH to VM and check Docker
ssh YOUR_USERNAME@15.207.111.124
docker --version
docker compose version

# Try manual build
cd /opt/querylab
docker compose build --no-cache
```

### Services not accessible
```bash
# Check GCP firewall rules - need ports 5174 and 8084 open
gcloud compute firewall-rules create querylab-frontend --allow tcp:5174
gcloud compute firewall-rules create querylab-api --allow tcp:8084
```

### Agents not discovering all 7 agents
```bash
ssh YOUR_USERNAME@15.207.111.124
cd /opt/querylab

# Check .agents directory
docker exec querylab-agents ls -la /app/.agents/

# Should show 7 folders:
# beat_observability, domain, meridian_ventures, evolus,
# InvestmentMemos, BoardMeetingNotes, MarketSectorReports

# Restart if needed
docker compose restart agents
docker compose logs agents
```

---

## Redeploy After Code Changes

```bash
# Update VM_USER in .env.deploy if needed
source .env.deploy

# Run deployment again
./deploy-to-vm.sh
```

The script will:
- Pull latest from git
- Rebuild images
- Restart services

---

## What This Deploys

**7 Query Labs Agents:**
1. beat_observability (SQL)
2. domain (SQL)
3. meridian_ventures (SQL)
4. evolus (Vector - Weaviate)
5. InvestmentMemos (Vector - Weaviate)
6. BoardMeetingNotes (Vector - Weaviate)
7. MarketSectorReports (Vector - Weaviate)

**5 MCP Servers:**
1. mysql_mcp (revenue - financial_metrics DB)
2. beat_mcp (beat_results_dev DB)
3. meridian_mcp (meridian_ventures DB)
4. weaviate_mcp (vector document retrieval)
5. Frontend (React + Vite)

**Services:**
- **Orchestrator**: Port 8084 (API gateway)
- **Agents**: Port 8000 (Internal)
- **Frontend**: Port 5174 (Web UI)
- **MCP Servers**: Ports 8003-8007 (Internal)

---

## Quick Reference

```bash
# View all logs
ssh YOUR_USERNAME@15.207.111.124 'cd /opt/querylab && docker compose logs -f'

# Restart all services
ssh YOUR_USERNAME@15.207.111.124 'cd /opt/querylab && docker compose restart'

# Stop all services
ssh YOUR_USERNAME@15.207.111.124 'cd /opt/querylab && docker compose down'

# Check service status
ssh YOUR_USERNAME@15.207.111.124 'cd /opt/querylab && docker compose ps'
```

---

## Automated CI/CD Deployment

For production environments, consider setting up **Bitbucket Pipelines** for automated deployment:

- **Zero-touch deployment**: Push to `main` → auto-deploys
- **Built-in health checks**: Automatic verification
- **Deployment history**: Track all deployments
- **Team collaboration**: Multiple developers can deploy

📘 **See [BITBUCKET_SETUP.md](BITBUCKET_SETUP.md) for complete Bitbucket Pipelines setup guide.**
