# Query Labs Deployment Automation

Automated deployment scripts and guides for deploying Query Labs to GCP VM.

**👉 Not sure which deployment method to use? See [DEPLOYMENT_COMPARISON.md](DEPLOYMENT_COMPARISON.md)**

---

## Files in This Folder

| File | Purpose |
|------|---------|
| **README.md** | This file - overview and quick reference |
| **DEPLOYMENT_COMPARISON.md** | **Compare methods** - Choose the right deployment approach |
| **QUICKSTART.md** | 5-step manual deployment guide |
| **BITBUCKET_SETUP.md** | Complete Bitbucket Pipelines CI/CD guide |
| **VM_DEPLOYMENT_GUIDE.md** | Comprehensive manual deployment guide |
| **deploy-to-vm.sh** | Automated deployment script (local) |
| **env.template** | Environment variable template |
| **bitbucket-pipelines.yml** | CI/CD pipeline configuration |
| **CHECKLIST.md** | Manual deployment checklist |
| **BITBUCKET_CHECKLIST.md** | Bitbucket Pipelines setup checklist |
| **scripts/generate-env.sh** | Environment file generator (for Bitbucket) |

---

## Current Deployment Architecture

### What Gets Deployed

**7 Query Labs Agents:**
- `beat_observability` - Beat earnings analysis (SQL)
- `domain` - Domain knowledge (SQL)
- `meridian_ventures` - Meridian investment data (SQL)
- `evolus` - Evolus product info (Vector/Weaviate)
- `InvestmentMemos` - Investment documents (Vector/Weaviate)
- `BoardMeetingNotes` - Board meeting minutes (Vector/Weaviate)
- `MarketSectorReports` - Market research (Vector/Weaviate)

**5 MCP Servers:**
- `mysql_mcp` - Revenue data from financial_metrics DB
- `beat_mcp` - Beat results from beat_results_dev DB
- `meridian_mcp` - Meridian data from meridian_ventures DB
- `weaviate_mcp` - Vector document retrieval from Weaviate
- Frontend - React/Vite web UI

**Infrastructure:**
- Orchestrator API (port 8084) - API gateway & authentication
- Agents API (port 8000) - Agent execution engine
- Frontend (port 5174) - Web interface

---

## Three Deployment Methods

### Method 1: Bitbucket Pipelines (Recommended for Production) 🚀

Best for: Automated CI/CD, production environments, team deployments

**Steps:**
1. Read [BITBUCKET_SETUP.md](BITBUCKET_SETUP.md)
2. Configure Bitbucket Repository Variables (27 variables)
3. Push to `main` branch → auto-deploys

**Pros:**
- ✅ Fully automated (zero-touch deployment)
- ✅ Triggered on every push to main
- ✅ Built-in health checks
- ✅ Deployment history & rollback
- ✅ Secrets managed in Bitbucket (never committed)
- ✅ Team collaboration

**Cons:**
- ❌ Initial setup required (one-time)
- ❌ Requires Bitbucket repository

---

### Method 2: Automated Script

Best for: Quick manual deployments, local automation, testing

**Steps:**
1. Read [QUICKSTART.md](QUICKSTART.md)
2. Configure `env.template` → `.env.deploy`
3. Run `deploy-to-vm.sh`

**Pros:**
- ✅ Fast (one command)
- ✅ Consistent
- ✅ Includes health checks
- ✅ Error handling
- ✅ No Bitbucket required

**Cons:**
- ❌ Manual trigger required
- ❌ Requires SSH key setup
- ❌ No deployment history

---

### Method 3: Manual Deployment

Best for: First-time setup, troubleshooting, learning

**Steps:**
1. Read [VM_DEPLOYMENT_GUIDE.md](VM_DEPLOYMENT_GUIDE.md)
2. SSH into VM
3. Manually create each .env file
4. Run Docker commands

**Pros:**
- ✅ Full control
- ✅ Better for learning
- ✅ Easier to troubleshoot
- ✅ No automation dependencies

**Cons:**
- ❌ Most time-consuming
- ❌ Error-prone (manual typing)
- ❌ Not scalable

---

## Prerequisites

1. **GCP VM** running Ubuntu 20.04/22.04
   - IP: `15.207.111.124`
   - Ports open: 22 (SSH), 5174 (frontend), 8084 (API)

2. **SSH Access** configured
   - SSH key added to VM
   - Can run: `ssh YOUR_USER@15.207.111.124`

3. **Git Repository** cloned on VM
   - Location: `/opt/querylab`
   - Permissions: owned by your user

4. **Required Credentials**
   - OpenAI API key
   - Weaviate API key
   - MySQL password
   - Secret key (for JWT tokens)

---

## Quick Start (TL;DR)

```bash
# 1. Configure environment
cd "h:/project_querylabs/querylab/deployment"
cp env.template .env.deploy
code .env.deploy  # Fill in: OPENAI_API_KEY, SECRET_KEY, passwords

# 2. Deploy
source .env.deploy
chmod +x deploy-to-vm.sh
./deploy-to-vm.sh

# 3. Access
# Frontend: http://15.207.111.124:5174
# API: http://15.207.111.124:8084/api/data_source/
```

---

## Service Ports

| Service | Internal | External | Public? |
|---------|----------|----------|---------|
| Agents | 8000 | 8000 | No |
| Orchestrator | 8082 | 8084 | Yes (API) |
| Frontend | 5173 | 5174 | Yes (Web UI) |
| mysql_mcp | 8000 | 8005 | No |
| beat_mcp | 8000 | 8006 | No |
| meridian_mcp | 8000 | 8007 | No |
| weaviate_mcp | 8001 | 8003 | No |

**Public URLs:**
- Frontend: `http://15.207.111.124:5174`
- API: `http://15.207.111.124:8084`

---

## Environment Variables

### Required (Must Configure)
- `OPENAI_API_KEY` - Your OpenAI API key
- `SECRET_KEY` - JWT secret (use: `querylab-change-me-secret`)
- `BACKEND_DB_PASSWORD` - MySQL password for authentication
- `WEAVIATE_API_KEY` - Weaviate API key

### Optional (Have Defaults)
- `VM_USER` - SSH username (default: current user)
- `LANGSMITH_API_KEY` - LLM observability (optional)
- Database hosts/ports (defaults to local Docker MySQL service `mysql:3306`)

See [env.template](env.template) for full list.

---

## Troubleshooting

### SSH Connection Failed
```bash
# Generate and copy SSH key
ssh-keygen -t rsa -b 4096
ssh-copy-id YOUR_USER@15.207.111.124
```

### Docker Not Installed on VM
```bash
# SSH to VM and install
ssh YOUR_USER@15.207.111.124
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt-get install -y docker-compose-plugin
exit  # Logout and login again
```

### Firewall Blocking Ports
```bash
# Add GCP firewall rules
gcloud compute firewall-rules create querylab-frontend --allow tcp:5174
gcloud compute firewall-rules create querylab-api --allow tcp:8084
```

### Services Not Starting
```bash
# SSH to VM and check
ssh YOUR_USER@15.207.111.124
cd /opt/querylab
docker compose ps
docker compose logs -f
```

### Database Connection Issues
```bash
# Test MySQL connectivity from VM
ssh YOUR_USER@15.207.111.124
docker exec -it querylab-mysql mysql -u querylab -p
# Enter password
```

### Weaviate Connection Issues
```bash
# Test Weaviate from VM
ssh YOUR_USER@15.207.111.124
curl -H 'Authorization: Bearer querylab-weaviate-key' http://127.0.0.1:8082/v1/meta
```

---

## Common Operations

### View Logs
```bash
ssh YOUR_USER@15.207.111.124 'cd /opt/querylab && docker compose logs -f'
```

### Restart Services
```bash
ssh YOUR_USER@15.207.111.124 'cd /opt/querylab && docker compose restart'
```

### Update and Redeploy
```bash
source .env.deploy
./deploy-to-vm.sh
```

### Stop Services
```bash
ssh YOUR_USER@15.207.111.124 'cd /opt/querylab && docker compose down'
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              GCP VM (15.207.111.124)             │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────┐      ┌──────────────┐        │
│  │  Frontend   │      │ Orchestrator │        │
│  │  (React)    │◄─────┤   (FastAPI)  │        │
│  │  :5174      │      │   :8084      │        │
│  └─────────────┘      └──────┬───────┘        │
│                               │                 │
│                               ▼                 │
│                       ┌──────────────┐         │
│                       │    Agents    │         │
│                       │  (7 agents)  │         │
│                       │    :8000     │         │
│                       └──────┬───────┘         │
│                              │                  │
│         ┌────────────┬───────┼───────┬────────┐│
│         ▼            ▼       ▼       ▼        ▼│
│  ┌──────────┐ ┌──────────┐  │  ┌──────────┐  │
│  │mysql_mcp │ │beat_mcp  │  │  │weaviate  │  │
│  │:8005     │ │:8006     │  │  │_mcp      │  │
│  └────┬─────┘ └────┬─────┘  │  │:8003     │  │
│       │            │         │  └────┬─────┘  │
└───────┼────────────┼─────────┼───────┼────────┘
        │            │         │       │
        ▼            ▼         ▼       ▼
   MySQL DBs     MySQL DBs  MySQL   Weaviate
   (External)    (External) (Ext)   (External)
```

---

## What's Next?

**For Production (Recommended):**
1. **Bitbucket CI/CD**: Read [BITBUCKET_SETUP.md](BITBUCKET_SETUP.md)
2. **Configure Variables**: Add 27 variables to Bitbucket
3. **Push to Deploy**: `git push origin main` → auto-deploys

**For Quick Manual Deployment:**
1. **Quick Start**: Read [QUICKSTART.md](QUICKSTART.md)
2. **Configure**: Copy and edit [env.template](env.template)
3. **Deploy**: Run `./deploy-to-vm.sh`
4. **Verify**: Access http://15.207.111.124:5174

**For Learning/Troubleshooting:**
1. **Detailed Manual**: See [VM_DEPLOYMENT_GUIDE.md](VM_DEPLOYMENT_GUIDE.md)

---

## Support

For issues or questions:
1. Check troubleshooting sections in guides
2. Review deployment logs on VM
3. Verify all environment variables are set
4. Test connectivity to external services (MySQL, Weaviate)
