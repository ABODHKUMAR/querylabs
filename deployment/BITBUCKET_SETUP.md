# Bitbucket Pipelines - Automated Deployment Setup

This guide explains how to set up automated deployment using Bitbucket Pipelines. Every push to the `main` branch will automatically deploy to your GCP VM.

---

## Prerequisites

1. ✅ Bitbucket repository with your code
2. ✅ GCP VM at 15.207.111.124 with Docker installed
3. ✅ Repository cloned on VM at `/opt/querylab`
4. ✅ SSH key for VM access
5. ✅ All credentials (OpenAI, Weaviate, MySQL passwords)

---

## How It Works

```
┌──────────────┐         ┌────────────────┐         ┌──────────────┐
│   Git Push   │────────>│   Bitbucket    │────────>│   GCP VM     │
│  to main     │         │   Pipelines    │  SSH    │  15.207.111.124   │
└──────────────┘         └────────────────┘         └──────────────┘
                                 │                           │
                                 │ 1. Copy generate-env.sh   │
                                 │ 2. Generate .env files    │
                                 │ 3. git pull               │
                                 │ 4. docker compose down    │
                                 │ 5. docker compose up      │
                                 │ 6. Health checks          │
                                 └───────────────────────────┘
```

**Workflow:**
1. Developer pushes code to `main` branch
2. Bitbucket Pipelines triggers automatically
3. Pipeline SSHs to VM with environment variables
4. Generates all .env files on VM (secrets never committed)
5. Pulls latest code from git
6. Rebuilds and restarts Docker containers
7. Runs health checks
8. Reports deployment status

---

## Step 1: Enable Bitbucket Pipelines

1. Go to your Bitbucket repository
2. Click **Repository settings** (sidebar)
3. Under **Pipelines**, click **Settings**
4. Toggle **Enable Pipelines** to ON
5. Click **Save**

---

## Step 2: Add SSH Key to Bitbucket

### 2.1 Generate SSH Key (if you don't have one)

```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -f ~/.ssh/bitbucket_deploy_key -N ""

# This creates:
# - Private key: ~/.ssh/bitbucket_deploy_key
# - Public key:  ~/.ssh/bitbucket_deploy_key.pub
```

### 2.2 Add Public Key to VM

```bash
# Copy public key to VM
ssh-copy-id -i ~/.ssh/bitbucket_deploy_key.pub YOUR_USER@15.207.111.124

# Or manually:
cat ~/.ssh/bitbucket_deploy_key.pub
# Then SSH to VM and append to ~/.ssh/authorized_keys
```

### 2.3 Add Private Key to Bitbucket

1. Copy the **private key** content:
   ```bash
   cat ~/.ssh/bitbucket_deploy_key
   ```

2. In Bitbucket, go to **Repository settings** → **SSH keys**
3. Click **Add key**
4. Paste the **private key** (entire content including BEGIN/END)
5. Click **Add SSH key**

**Note:** You can also add the private key as a secure variable (see Step 3).

---

## Step 3: Configure Secure Variables

Bitbucket Pipelines uses **Repository Variables** to securely store secrets. These are injected at runtime and never appear in logs or code.

### 3.1 Navigate to Repository Variables

1. Go to your Bitbucket repository
2. Click **Repository settings** (sidebar)
3. Under **Pipelines**, click **Repository variables**
4. Click **Add variable**

### 3.2 Add All Required Variables

Add each variable below. **Check "Secured"** for all sensitive values (passwords, API keys).

#### **VM Configuration**
| Variable | Value | Secured? | Example |
|----------|-------|----------|---------|
| `GCP_VM_IP` | 15.207.111.124 | No | 15.207.111.124 |
| `GCP_VM_USER` | Your SSH username | No | ubuntu |
| `GCP_SSH_PRIVATE_KEY` | SSH private key (entire content) | **Yes** | -----BEGIN RSA PRIVATE KEY----- ... |

#### **OpenAI & AI Services**
| Variable | Value | Secured? |
|----------|-------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | **Yes** |
| `LANGSMITH_API_KEY` | Langsmith API key (optional) | **Yes** |
| `LANGSMITH_TRACING` | true | No |
| `LANGSMITH_PROJECT` | querylab-prod | No |

#### **Authentication**
| Variable | Value | Secured? |
|----------|-------|----------|
| `SECRET_KEY` | querylab-change-me-secret | **Yes** |

#### **Backend Database (for user auth in querylab_auth)**
| Variable | Value | Secured? | Example |
|----------|-------|----------|---------|
| `BACKEND_DB_HOST` | mysql | No | mysql |
| `BACKEND_DB_USER` | querylab | No | querylab |
| `BACKEND_DB_PASSWORD` | Your MySQL password | **Yes** | ********** |
| `BACKEND_DB_DATABASE` | querylab_auth | No | querylab_auth |

#### **Revenue MCP (financial_metrics database)**
| Variable | Value | Secured? | Example |
|----------|-------|----------|---------|
| `REVENUE_MYSQL_HOST` | mysql | No | mysql |
| `REVENUE_MYSQL_USER` | querylab | No | querylab |
| `REVENUE_MYSQL_PASSWORD` | Your MySQL password | **Yes** | ********** |
| `REVENUE_MYSQL_DATABASE` | financial_metrics | No | financial_metrics |

#### **Beat MCP (beat_results_dev database)**
| Variable | Value | Secured? | Example |
|----------|-------|----------|---------|
| `BEAT_MYSQL_HOST` | mysql | No | mysql |
| `BEAT_MYSQL_USER` | querylab | No | querylab |
| `BEAT_MYSQL_PASSWORD` | Your MySQL password | **Yes** | ********** |
| `BEAT_MYSQL_DATABASE` | beat_results_dev | No | beat_results_dev |

#### **Meridian MCP (meridian_ventures database) - NEW**
| Variable | Value | Secured? | Example |
|----------|-------|----------|---------|
| `MERIDIAN_MYSQL_HOST` | mysql | No | mysql |
| `MERIDIAN_MYSQL_USER` | querylab | No | querylab |
| `MERIDIAN_MYSQL_PASSWORD` | Your MySQL password | **Yes** | ********** |
| `MERIDIAN_MYSQL_DATABASE` | meridian_ventures | No | meridian_ventures |

#### **Weaviate Configuration - NEW**
| Variable | Value | Secured? | Example |
|----------|-------|----------|---------|
| `WEAVIATE_HOST` | weaviate | No | weaviate |
| `WEAVIATE_PORT` | 8082 | No | 8082 |
| `WEAVIATE_API_KEY` | Your Weaviate API key | **Yes** | ********** |

---

## Step 4: Commit Pipelines Configuration

The repository already includes `bitbucket-pipelines.yml` in the root. Make sure it's committed:

```bash
# Check if file exists
cat bitbucket-pipelines.yml

# If not, copy from deployment folder
cp "deployment/bitbucket-pipelines.yml" .

# Commit and push
git add bitbucket-pipelines.yml
git commit -m "Add Bitbucket Pipelines configuration"
git push origin main
```

---

## Step 5: Test Deployment

### 5.1 Trigger First Deployment

Make a small change and push to `main`:

```bash
# Make a change
echo "# Deployment test" >> README.md

# Commit and push
git add README.md
git commit -m "Test Bitbucket Pipelines deployment"
git push origin main
```

### 5.2 Monitor Pipeline Execution

1. Go to Bitbucket → **Pipelines** (sidebar)
2. You'll see the pipeline running
3. Click on it to see logs in real-time
4. Takes 5-10 minutes (mostly Docker build time)

### 5.3 Verify Deployment

After pipeline completes (green checkmark):

```bash
# Check services are running
curl http://15.207.111.124:8000/health

# Check API
curl http://15.207.111.124:8084/api/data_source/

# Check frontend
# Open browser: http://15.207.111.124:5174
```

---

## Step 6: Understanding Pipeline Stages

The pipeline runs these steps in order:

### 1️⃣ **Install SSH client**
```bash
apt-get install -y openssh-client
```

### 2️⃣ **Configure SSH key**
```bash
# Creates ~/.ssh/deploy_key from GCP_SSH_PRIVATE_KEY variable
# Adds VM to known_hosts
```

### 3️⃣ **Copy generate-env.sh to VM**
```bash
scp scripts/generate-env.sh vm:/tmp/
```

### 4️⃣ **SSH and deploy**
```bash
# SSH with all environment variables
# Run generate-env.sh (creates .env files)
# git pull (get latest code)
# docker compose down (stop old containers)
# docker compose up --build -d (rebuild and start)
```

### 5️⃣ **Health checks**
```bash
# Wait 30 seconds for startup
# Check agents API: http://VM:8000/health
# Check orchestrator API: http://VM:8084/health
```

### 6️⃣ **Report success**
```bash
echo "Deployment successful!"
```

---

## Deployment Logs

### View Pipeline Logs

1. Bitbucket → **Pipelines** → Click on pipeline run
2. Expand each step to see details
3. Look for:
   - ✅ Green checkmarks = success
   - ❌ Red X = failure (click to see error)

### View Application Logs on VM

```bash
# SSH to VM
ssh YOUR_USER@15.207.111.124

# View all logs
cd /opt/querylab
docker compose logs -f

# View specific service
docker compose logs -f agents
docker compose logs -f orchestrator
docker compose logs -f weaviate_mcp
```

---

## Troubleshooting

### Pipeline Fails at SSH Connection

**Error:** `Permission denied (publickey)`

**Solution:**
1. Verify SSH key is added to Bitbucket: **Repository settings** → **SSH keys**
2. Verify public key is on VM in `~/.ssh/authorized_keys`
3. Test SSH locally:
   ```bash
   ssh -i ~/.ssh/bitbucket_deploy_key YOUR_USER@15.207.111.124
   ```

### Pipeline Fails: Missing Variable

**Error:** `MERIDIAN_MYSQL_HOST: unbound variable`

**Solution:**
- Go to **Repository settings** → **Repository variables**
- Add the missing variable
- Re-run the pipeline

### Health Check Fails

**Error:** `agents /health failed` or `orchestrator /health failed`

**Solution:**
```bash
# SSH to VM and check logs
ssh YOUR_USER@15.207.111.124
cd /opt/querylab
docker compose ps
docker compose logs agents
docker compose logs orchestrator

# Check if services started
docker compose up -d

# Wait longer for services to start (increase sleep time in pipeline)
```

### Docker Build Fails

**Error:** `ERROR: failed to solve: process "/bin/sh -c poetry install --no-dev" did not complete`

**Solution:**
1. SSH to VM and check disk space:
   ```bash
   df -h
   ```
2. Clean Docker cache:
   ```bash
   docker system prune -af
   docker volume prune -f
   ```
3. Re-run pipeline

### Firewall Blocking Health Checks

**Error:** Pipeline completes but health checks timeout

**Solution:**
```bash
# Add firewall rules in GCP
gcloud compute firewall-rules create querylab-health-checks \
    --allow tcp:8000,tcp:8084 \
    --source-ranges 0.0.0.0/0
```

---

## Advanced Configuration

### Deploy to Multiple Environments

Modify `bitbucket-pipelines.yml` to deploy to staging/production:

```yaml
pipelines:
  branches:
    develop:
      - step:
          name: Deploy to Staging
          deployment: staging
          # ... use STAGING_VM_IP variables
    
    main:
      - step:
          name: Deploy to Production
          deployment: production
          # ... use PRODUCTION_VM_IP variables
```

### Manual Deployments

Add custom pipeline for manual triggers:

```yaml
pipelines:
  custom:
    manual-deploy:
      - step:
          name: Manual Deploy to Production
          deployment: production
          trigger: manual
          # ... same deployment steps
```

Then trigger via: **Pipelines** → **Run pipeline** → Select `manual-deploy`

### Slack/Discord Notifications

Add after deployment:

```yaml
- pipe: atlassian/slack-notify:1.0.1
  variables:
    WEBHOOK_URL: $SLACK_WEBHOOK_URL
    MESSAGE: "Query Labs deployed to production successfully!"
```

---

## Security Best Practices

1. ✅ **Always mark sensitive variables as "Secured"**
   - API keys, passwords, SSH keys should be secured
   - Bitbucket will mask these in logs

2. ✅ **Never commit .env files to git**
   - `.gitignore` should include `.env*`
   - Use `generate-env.sh` to create them on VM

3. ✅ **Rotate SSH keys periodically**
   - Generate new SSH key every 6-12 months
   - Update in Bitbucket variables

4. ✅ **Use separate credentials for production**
   - Don't use same passwords for dev/staging/prod
   - Use Bitbucket deployment environments

5. ✅ **Review pipeline logs**
   - Ensure no secrets are exposed in logs
   - If you see secrets, mark variables as "Secured"

---

## Quick Reference

### Required Bitbucket Variables (27 total)

**Infrastructure (3):**
- GCP_VM_IP, GCP_VM_USER, GCP_SSH_PRIVATE_KEY

**AI Services (4):**
- OPENAI_API_KEY, LANGSMITH_API_KEY, LANGSMITH_TRACING, LANGSMITH_PROJECT

**Auth (1):**
- SECRET_KEY

**Backend DB (4):**
- BACKEND_DB_HOST, BACKEND_DB_USER, BACKEND_DB_PASSWORD, BACKEND_DB_DATABASE

**Revenue MCP (4):**
- REVENUE_MYSQL_HOST, REVENUE_MYSQL_USER, REVENUE_MYSQL_PASSWORD, REVENUE_MYSQL_DATABASE

**Beat MCP (4):**
- BEAT_MYSQL_HOST, BEAT_MYSQL_USER, BEAT_MYSQL_PASSWORD, BEAT_MYSQL_DATABASE

**Meridian MCP (4):**
- MERIDIAN_MYSQL_HOST, MERIDIAN_MYSQL_USER, MERIDIAN_MYSQL_PASSWORD, MERIDIAN_MYSQL_DATABASE

**Weaviate (3):**
- WEAVIATE_HOST, WEAVIATE_PORT, WEAVIATE_API_KEY

---

## Deployment Frequency

Once setup is complete:

- **Every push to `main`** triggers automatic deployment
- Takes **5-10 minutes** per deployment
- **Zero downtime** (docker compose down/up is very fast)
- Health checks ensure successful deployment

---

## Next Steps

1. ✅ Complete Step 1-6 above
2. ✅ Test first deployment
3. ✅ Monitor logs
4. ✅ Set up Slack notifications (optional)
5. ✅ Create staging environment (optional)
6. ✅ Document rollback procedure

---

## Support

If issues persist:
1. Check Bitbucket Pipeline logs
2. SSH to VM and check Docker logs
3. Verify all 27 variables are set in Bitbucket
4. Test manual deployment using `deploy-to-vm.sh` script
