# VM Deployment Checklist

Use this checklist to track your **manual deployment** progress.

**For automated Bitbucket Pipelines deployment**, see [BITBUCKET_CHECKLIST.md](BITBUCKET_CHECKLIST.md) instead.

---

## Phase 1: Prerequisites ✓

- [ ] GCP VM created (Ubuntu 20.04/22.04)
  - VM IP: `15.207.111.124`
  - Confirm: `ping 15.207.111.124`

- [ ] SSH access configured
  - SSH key generated: `ssh-keygen -t rsa -b 4096`
  - SSH key copied to VM: `ssh-copy-id YOUR_USER@15.207.111.124`
  - Can connect: `ssh YOUR_USER@15.207.111.124`

- [ ] Docker installed on VM
  - Run: `ssh YOUR_USER@15.207.111.124 "docker --version"`
  - Should see: Docker version 24.x or higher

- [ ] Docker Compose installed on VM
  - Run: `ssh YOUR_USER@15.207.111.124 "docker compose version"`
  - Should see: Docker Compose version v2.x

- [ ] Repository cloned on VM at `/opt/querylab`
  - Run: `ssh YOUR_USER@15.207.111.124 "ls /opt/querylab"`
  - Should see: docker-compose.yaml, agents/, orchestrator/, etc.

---

## Phase 2: Credentials & Configuration ✓

- [ ] **OpenAI API key** obtained
  - From: https://platform.openai.com/api-keys
  - Format: `sk-...`

- [ ] **Weaviate API key** obtained
  - For server: local Docker `weaviate:8080` (host port `127.0.0.1:8082`)

- [ ] **MySQL password** confirmed
  - Host: `mysql`
  - User: `querylab`
  - Databases: querylab_auth, financial_metrics, beat_results_dev, meridian_ventures

- [ ] **Secret key** set
  - Use same as local: `querylab-change-me-secret`
  - This MUST match across all environments

- [ ] **Langsmith API key** (optional)
  - From: https://smith.langchain.com/
  - For LLM observability

---

## Phase 3: Deployment Files ✓

- [ ] Copied `env.template` to `.env.deploy`
  ```bash
  cd "h:/project_querylabs/querylab/deployment"
  cp env.template .env.deploy
  ```

- [ ] Edited `.env.deploy` with actual values
  - [ ] Set `OPENAI_API_KEY`
  - [ ] Set `SECRET_KEY`
  - [ ] Set `BACKEND_DB_PASSWORD`
  - [ ] Set `WEAVIATE_API_KEY`
  - [ ] Set `VM_USER` (your SSH username)
  - [ ] Set `LANGSMITH_API_KEY` (optional)

- [ ] Made deployment script executable
  ```bash
  chmod +x deploy-to-vm.sh
  ```

---

## Phase 4: Firewall Configuration ✓

- [ ] Port 22 (SSH) open
  - Test: `ssh YOUR_USER@15.207.111.124`

- [ ] Port 5174 (Frontend) open
  - GCP: Create firewall rule for tcp:5174

- [ ] Port 8084 (API) open
  - GCP: Create firewall rule for tcp:8084

Create firewall rules:
```bash
gcloud compute firewall-rules create querylab-frontend --allow tcp:5174 --source-ranges 0.0.0.0/0
gcloud compute firewall-rules create querylab-api --allow tcp:8084 --source-ranges 0.0.0.0/0
```

---

## Phase 5: Deployment Execution ✓

- [ ] Sourced environment variables
  ```bash
  source .env.deploy
  ```

- [ ] Tested SSH connection
  ```bash
  ssh YOUR_USER@15.207.111.124 "echo 'SSH OK'"
  ```

- [ ] Ran deployment script
  ```bash
  ./deploy-to-vm.sh
  ```

- [ ] Deployment completed without errors
  - Look for: "Deployment completed successfully!"

---

## Phase 6: Service Verification ✓

### Container Status
- [ ] All 7 containers running
  ```bash
  ssh YOUR_USER@15.207.111.124 'cd /opt/querylab && docker compose ps'
  ```
  Should show:
  - querylab-agents
  - querylab-orchestrator
  - beat-mysql-mcp
  - revenue-mysql-mcp
  - meridian-mysql-mcp
  - weaviate-mcp
  - querylab-frontend

### Agent Discovery
- [ ] All 7 agents discovered
  ```bash
  ssh YOUR_USER@15.207.111.124 'cd /opt/querylab && docker compose logs agents | grep "Built"'
  ```
  Should show: beat_observability, domain, meridian_ventures, evolus, InvestmentMemos, BoardMeetingNotes, MarketSectorReports

### API Health
- [ ] Agents API responding
  ```bash
  curl http://15.207.111.124:8000/health
  ```
  Should return: `{"status":"ok"}`

- [ ] Orchestrator API responding
  ```bash
  curl http://15.207.111.124:8084/api/data_source/
  ```
  Should return: JSON array with data sources

### MCP Servers
- [ ] mysql_mcp (revenue) running
- [ ] beat_mcp running
- [ ] meridian_mcp running
- [ ] weaviate_mcp running
  ```bash
  ssh YOUR_USER@15.207.111.124 'cd /opt/querylab && docker compose logs mysql_mcp | grep "MCP server running"'
  ```

---

## Phase 7: Frontend Access ✓

- [ ] Frontend accessible in browser
  - URL: http://15.207.111.124:5174
  - Should see: Query Labs login page

- [ ] Can login with credentials
  - Should redirect to main interface

- [ ] All 7 data sources visible
  - SQL: beat_observability, domain, meridian_ventures
  - Vector: evolus, InvestmentMemos, BoardMeetingNotes, MarketSectorReports

- [ ] Can query data sources
  - Try: "Show me recent beat data"
  - Should see: Response from agent

---

## Phase 8: External Service Connectivity ✓

### MySQL Databases
- [ ] Can connect to MySQL from VM
  ```bash
  ssh YOUR_USER@15.207.111.124 'docker exec -it querylab-mysql mysql -u querylab -p'
  ```

- [ ] mysql_mcp can query financial_metrics
  - Check logs for successful queries

- [ ] beat_mcp can query beat_results_dev
  - Check logs for successful queries

- [ ] meridian_mcp can query meridian_ventures
  - Check logs for successful queries

### Weaviate
- [ ] Can reach Weaviate from VM
  ```bash
  ssh YOUR_USER@15.207.111.124 'curl -H 'Authorization: Bearer querylab-weaviate-key' http://127.0.0.1:8082/v1/meta'
  ```
  Should return: JSON with Weaviate version

- [ ] weaviate_mcp can retrieve documents
  - Check logs for successful retrievals

---

## Phase 9: End-to-End Testing ✓

- [ ] **SQL query test**
  - Query: "What were the beat results for last quarter?"
  - Expected: Response from beat_observability or domain agent

- [ ] **Vector query test**
  - Query: "What are the key points from recent investment memos?"
  - Expected: Response from InvestmentMemos agent with document excerpts

- [ ] **Multi-source query test**
  - Query: "Compare beat results with board meeting discussions"
  - Expected: Response combining SQL and vector data

- [ ] **Authentication test**
  - Logout and login again
  - Should work without token errors

---

## Phase 10: Monitoring Setup ✓

- [ ] Created health check script on VM
  ```bash
  ssh YOUR_USER@15.207.111.124
  cat > /opt/querylab/health-check.sh <<'EOF'
  #!/bin/bash
  echo "=== Container Status ==="
  docker compose ps
  echo ""
  echo "=== Agents API ==="
  curl -s http://localhost:8000/health
  echo ""
  echo "=== Orchestrator API ==="
  curl -s http://localhost:8084/api/data_source/ | jq 'length'
  EOF
  chmod +x /opt/querylab/health-check.sh
  ```

- [ ] Can run health check
  ```bash
  ssh YOUR_USER@15.207.111.124 '/opt/querylab/health-check.sh'
  ```

- [ ] Set up log monitoring (optional)
  - Graylog, Datadog, CloudWatch, etc.

---

## Common Issues & Solutions

### Issue: "SSH connection failed"
**Solution:**
```bash
ssh-keygen -t rsa -b 4096
ssh-copy-id YOUR_USER@15.207.111.124
```

### Issue: "Cannot reach frontend at :5174"
**Solution:**
- Check firewall: `gcloud compute firewall-rules list`
- Add rule: `gcloud compute firewall-rules create querylab-frontend --allow tcp:5174`

### Issue: "Only 3 agents discovered, not 7"
**Solution:**
```bash
ssh YOUR_USER@15.207.111.124
cd /opt/querylab
docker exec querylab-agents ls -la /app/.agents/
# Should show 7 directories
docker compose restart agents
docker compose logs -f agents
```

### Issue: "Weaviate connection timeout"
**Solution:**
```bash
# Test from VM
ssh YOUR_USER@15.207.111.124 'curl -v -H 'Authorization: Bearer querylab-weaviate-key' http://127.0.0.1:8082/v1/meta'
# Check if port 8082 is correct (not 8080)
```

### Issue: "HTTP 401: Invalid token"
**Solution:**
- Verify SECRET_KEY matches in .env.deploy
- Redeploy: `source .env.deploy && ./deploy-to-vm.sh`

### Issue: "MySQL connection refused"
**Solution:**
```bash
# Test from VM
ssh YOUR_USER@15.207.111.124 'docker exec -it querylab-mysql mysql -u querylab -p'
# Verify password is correct
```

---

## Deployment Complete! 🎉

Once all checkboxes are ✓, your deployment is complete and production-ready.

**Access Points:**
- Frontend: http://15.207.111.124:5174
- API: http://15.207.111.124:8084
- Docs: http://15.207.111.124:8084/docs

**Next Steps:**
- Monitor logs regularly
- Set up automated backups
- Configure SSL/HTTPS (optional)
- Set up log aggregation
- Create deployment runbook
