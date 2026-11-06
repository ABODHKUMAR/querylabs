# Bitbucket Pipelines Setup Checklist

Quick checklist for setting up automated deployment via Bitbucket Pipelines.

---

## Phase 1: Bitbucket Configuration ✓

- [ ] **Enable Bitbucket Pipelines**
  - Repository settings → Pipelines → Settings
  - Toggle "Enable Pipelines" to ON

- [ ] **Generate SSH key for deployment**
  ```bash
  ssh-keygen -t rsa -b 4096 -f ~/.ssh/bitbucket_deploy_key -N ""
  ```

- [ ] **Add public key to VM**
  ```bash
  ssh-copy-id -i ~/.ssh/bitbucket_deploy_key.pub YOUR_USER@15.207.111.124
  ```

- [ ] **Add private key to Bitbucket**
  - Repository settings → SSH keys → Add key
  - Paste entire private key content
  - OR add as `GCP_SSH_PRIVATE_KEY` variable

---

## Phase 2: Repository Variables (27 total) ✓

Go to: **Repository settings** → **Repository variables**

### Infrastructure (3 variables)
- [ ] `GCP_VM_IP` = `15.207.111.124` (not secured)
- [ ] `GCP_VM_USER` = Your SSH username (not secured)
- [ ] `GCP_SSH_PRIVATE_KEY` = SSH private key (SECURED)

### OpenAI & AI Services (4 variables)
- [ ] `OPENAI_API_KEY` = Your OpenAI key (SECURED)
- [ ] `LANGSMITH_API_KEY` = Langsmith key (SECURED, optional)
- [ ] `LANGSMITH_TRACING` = `true` (not secured)
- [ ] `LANGSMITH_PROJECT` = `querylab-prod` (not secured)

### Authentication (1 variable)
- [ ] `SECRET_KEY` = `querylab-change-me-secret` (SECURED)

### Backend Database - querylab_auth (4 variables)
- [ ] `BACKEND_DB_HOST` = `mysql` (not secured)
- [ ] `BACKEND_DB_USER` = `querylab` (not secured)
- [ ] `BACKEND_DB_PASSWORD` = MySQL password (SECURED)
- [ ] `BACKEND_DB_DATABASE` = `querylab_auth` (not secured)

### Revenue MCP - financial_metrics (4 variables)
- [ ] `REVENUE_MYSQL_HOST` = `mysql` (not secured)
- [ ] `REVENUE_MYSQL_USER` = `querylab` (not secured)
- [ ] `REVENUE_MYSQL_PASSWORD` = MySQL password (SECURED)
- [ ] `REVENUE_MYSQL_DATABASE` = `financial_metrics` (not secured)

### Beat MCP - beat_results_dev (4 variables)
- [ ] `BEAT_MYSQL_HOST` = `mysql` (not secured)
- [ ] `BEAT_MYSQL_USER` = `querylab` (not secured)
- [ ] `BEAT_MYSQL_PASSWORD` = MySQL password (SECURED)
- [ ] `BEAT_MYSQL_DATABASE` = `beat_results_dev` (not secured)

### Meridian MCP - meridian_ventures (4 variables)
- [ ] `MERIDIAN_MYSQL_HOST` = `mysql` (not secured)
- [ ] `MERIDIAN_MYSQL_USER` = `querylab` (not secured)
- [ ] `MERIDIAN_MYSQL_PASSWORD` = MySQL password (SECURED)
- [ ] `MERIDIAN_MYSQL_DATABASE` = `meridian_ventures` (not secured)

### Weaviate Configuration (3 variables)
- [ ] `WEAVIATE_HOST` = `weaviate` (not secured)
- [ ] `WEAVIATE_PORT` = `8082` (not secured)
- [ ] `WEAVIATE_API_KEY` = Weaviate API key (SECURED)

---

## Phase 3: Pipeline Configuration ✓

- [ ] **Commit bitbucket-pipelines.yml to repo**
  ```bash
  cp "deployment/bitbucket-pipelines.yml" .
  git add bitbucket-pipelines.yml
  git commit -m "Add Bitbucket Pipelines configuration"
  git push origin main
  ```

- [ ] **Verify file is in repository root**
  - File must be at: `bitbucket-pipelines.yml` (not in subfolder)

---

## Phase 4: Test Deployment ✓

- [ ] **Trigger first deployment**
  ```bash
  echo "# Test" >> README.md
  git add README.md
  git commit -m "Test Bitbucket Pipelines"
  git push origin main
  ```

- [ ] **Monitor pipeline execution**
  - Bitbucket → Pipelines (sidebar)
  - Click on running pipeline
  - Watch logs in real-time

- [ ] **Pipeline completes successfully**
  - All steps show green checkmarks
  - Health checks pass
  - "Deployment successful!" message appears

---

## Phase 5: Verify Deployment ✓

### Check Services
- [ ] **Agents API responding**
  ```bash
  curl http://15.207.111.124:8000/health
  ```
  Should return: `{"status":"ok"}`

- [ ] **Orchestrator API responding**
  ```bash
  curl http://15.207.111.124:8084/api/data_source/
  ```
  Should return: JSON array with 7 data sources

- [ ] **Frontend accessible**
  - Open: http://15.207.111.124:5174
  - Should see: Query Labs login page

### Check Containers on VM
- [ ] **All 7 containers running**
  ```bash
  ssh YOUR_USER@15.207.111.124 'cd /opt/querylab && docker compose ps'
  ```

- [ ] **All 7 agents discovered**
  ```bash
  ssh YOUR_USER@15.207.111.124 'cd /opt/querylab && docker compose logs agents | grep "Built"'
  ```

---

## Common Setup Issues

### ❌ "Permission denied (publickey)"
**Solution:**
- Verify SSH key added to Bitbucket
- Verify public key on VM in `~/.ssh/authorized_keys`
- Test: `ssh -i ~/.ssh/bitbucket_deploy_key YOUR_USER@15.207.111.124`

### ❌ "MERIDIAN_MYSQL_HOST: unbound variable"
**Solution:**
- Go to Repository variables
- Add missing variable
- Mark sensitive values as "Secured"
- Re-run pipeline

### ❌ "agents /health failed"
**Solution:**
```bash
# SSH to VM and check logs
ssh YOUR_USER@15.207.111.124
cd /opt/querylab
docker compose logs agents

# Restart if needed
docker compose restart agents
```

### ❌ Pipeline succeeds but services not working
**Solution:**
- Check firewall rules (ports 8000, 8084, 5174)
- SSH to VM and run manual health checks
- Review `.env` files on VM: `cat /opt/querylab/.env.agent`

---

## Post-Setup

Once all checkboxes are ✓:

✅ **Every push to `main` will auto-deploy**
✅ **Deployment takes 5-10 minutes**
✅ **Health checks ensure successful deployment**
✅ **No .env files in git (secrets safe)**

---

## Regular Operations

### View Deployment History
- Bitbucket → Pipelines
- See all past deployments
- Click any to view logs

### Manually Trigger Deployment
- Bitbucket → Pipelines → Run pipeline
- Select branch: `main`
- Click "Run"

### Rollback to Previous Version
```bash
# SSH to VM
ssh YOUR_USER@15.207.111.124
cd /opt/querylab

# Checkout previous commit
git log --oneline -n 10  # Find commit hash
git checkout <commit-hash>

# Redeploy
docker compose down
docker compose up --build -d
```

### Update Environment Variables
1. Repository settings → Repository variables
2. Edit variable value
3. Re-run pipeline (or push new commit)

---

## Security Reminders

- ✅ All passwords/API keys marked as "Secured" in Bitbucket
- ✅ Never commit `.env` files to git
- ✅ SSH private key stored securely in Bitbucket
- ✅ Rotate SSH keys every 6-12 months
- ✅ Review pipeline logs for exposed secrets

---

## Success Criteria

Pipeline is successfully configured when:

1. ✅ Push to `main` triggers automatic deployment
2. ✅ All pipeline steps complete with green checkmarks
3. ✅ Health checks pass
4. ✅ Services accessible at http://15.207.111.124:5174
5. ✅ All 7 agents discovered and working
6. ✅ No secrets exposed in logs

---

**You're done! 🎉 Every push to `main` will now automatically deploy to production.**
