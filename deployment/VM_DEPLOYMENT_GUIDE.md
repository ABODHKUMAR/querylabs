# Query Labs - Complete VM Deployment Guide

End-to-end deployment guide for deploying Query Labs with 7 agents and 5 MCP servers to a fresh GCP VM.

---

## Prerequisites

- Fresh GCP VM (Ubuntu 20.04/22.04)
- VM IP: `15.207.111.124`
- SSH access to VM
- Git repository access

---

## Part 1: VM Initial Setup (One-Time)

### Step 1: SSH into your VM

```bash
ssh YOUR_USERNAME@15.207.111.124
```

### Step 2: Install Docker and Docker Compose

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Logout and login again for group changes to take effect
exit
```

### Step 3: SSH back and verify Docker

```bash
ssh YOUR_USERNAME@15.207.111.124
docker --version
docker compose version
```

### Step 4: Create deployment directory and clone repo

```bash
# Create deployment directory
sudo mkdir -p /opt/querylab
sudo chown $USER:$USER /opt/querylab

# Clone your repository
cd /opt/querylab
git clone YOUR_GIT_REPO_URL .

# Or if already cloned, pull latest
# cd /opt/querylab && git pull origin main
```

---

## Part 2: Configure Environment Variables

### Step 5: Create all .env files on VM

SSH into VM and run the following commands to create each .env file:

#### **Create .env.agent**
```bash
cat > /opt/querylab/.env.agent <<'EOF'
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini

# Langsmith (optional)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=YOUR_LANGSMITH_KEY
LANGSMITH_PROJECT=querylab-prod
EOF
```

#### **Create .env.orchestrator**
```bash
cat > /opt/querylab/.env.orchestrator <<'EOF'
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini

# Authentication
SECRET_KEY=YOUR_SECRET_KEY_HERE
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Backend Database (for user auth)
BACKEND_DB_HOST=mysql
BACKEND_DB_USER=querylab
BACKEND_DB_PASSWORD=YOUR_PASSWORD
BACKEND_DB_DATABASE=querylab_auth
BACKEND_DB_PORT=3306

ORCHESTRATOR_RELOAD=false
ORCHESTRATOR_LOG_LEVEL=INFO
EOF
```

#### **Create .env.revenue.mcp**
```bash
cat > /opt/querylab/.env.revenue.mcp <<'EOF'
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=querylab
MYSQL_PASSWORD=YOUR_PASSWORD
MYSQL_DATABASE=financial_metrics

MCP_HOST=0.0.0.0
MCP_PORT=8000
MCP_LOG_LEVEL=INFO
EOF
```

#### **Create .env.beat.mcp**
```bash
cat > /opt/querylab/.env.beat.mcp <<'EOF'
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=querylab
MYSQL_PASSWORD=YOUR_PASSWORD
MYSQL_DATABASE=beat_results_dev

MCP_HOST=0.0.0.0
MCP_PORT=8000
MCP_LOG_LEVEL=INFO
EOF
```

#### **Create .env.meridian.mcp**
```bash
cat > /opt/querylab/.env.meridian.mcp <<'EOF'
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=querylab
MYSQL_PASSWORD=YOUR_PASSWORD
MYSQL_DATABASE=meridian_ventures

MCP_HOST=0.0.0.0
MCP_PORT=8000
MCP_LOG_LEVEL=INFO
EOF
```

#### **Create .env.weaviate.mcp**
```bash
cat > /opt/querylab/.env.weaviate.mcp <<'EOF'
WEAVIATE_HOST=weaviate
WEAVIATE_PORT=8082
WEAVIATE_API_KEY=YOUR_WEAVIATE_API_KEY

OPENAI_API_KEY=YOUR_OPENAI_API_KEY
WEAVIATE_EMBEDDING_MODEL=text-embedding-3-small

MCP_HOST=0.0.0.0
MCP_PORT=8001
MCP_LOG_LEVEL=INFO
DOCKER_RUNNING=true
EOF
```

---

## Part 3: Deploy Application

### Step 6: Build and start all services

```bash
cd /opt/querylab

# Build all images (first time only, takes 5-10 minutes)
docker compose build

# Start all services
docker compose up -d

# Check status
docker compose ps
```

### Step 7: Verify deployment

```bash
# Check all containers are running
docker compose ps

# Check logs
docker compose logs -f agents
docker compose logs -f orchestrator

# Test endpoints
curl http://15.207.111.124:8000/health     # Agents API
curl http://15.207.111.124:8084/api/data_source/  # Orchestrator API
```

### Step 8: Verify services in browser

- **Frontend**: http://15.207.111.124:5174
- **API**: http://15.207.111.124:8084/api/data_source/

---

## Part 4: Common Operations

### Update and Redeploy

```bash
cd /opt/querylab
git pull origin main
docker compose down
docker compose build
docker compose up -d
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f agents
docker compose logs -f orchestrator
docker compose logs -f weaviate_mcp
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart agents
docker compose restart orchestrator
```

### Stop Services

```bash
# Stop without removing
docker compose stop

# Stop and remove containers
docker compose down

# Stop and remove everything including volumes
docker compose down -v
```

---

## Part 5: Firewall Configuration

Make sure these ports are open on the VM:

```bash
# For GCP: Configure firewall rules
gcloud compute firewall-rules create querylab-frontend \
    --allow tcp:5174 \
    --source-ranges 0.0.0.0/0 \
    --description "Query Labs frontend"

gcloud compute firewall-rules create querylab-api \
    --allow tcp:8084 \
    --source-ranges 0.0.0.0/0 \
    --description "Query Labs orchestrator API"

# For HTTPS (see Part 8) — nginx terminates TLS on 80/443
gcloud compute firewall-rules create querylab-http \
    --allow tcp:80 \
    --source-ranges 0.0.0.0/0 \
    --description "Query Labs HTTP (ACME challenge + redirect to HTTPS)"

gcloud compute firewall-rules create querylab-https \
    --allow tcp:443 \
    --source-ranges 0.0.0.0/0 \
    --description "Query Labs HTTPS"
```

---

## Part 6: Troubleshooting

### Agents not discovering all 7 agents

```bash
# Check .agents directory is mounted
docker exec querylab-agents ls -la /app/.agents/

# Should show: beat_observability, domain, meridian_ventures, evolus,
#              InvestmentMemos, BoardMeetingNotes, MarketSectorReports

# Restart agents
docker compose restart agents
docker compose logs -f agents
```

### Weaviate connection failing

```bash
# Test from VM
curl -H 'Authorization: Bearer querylab-weaviate-key' http://127.0.0.1:8082/v1/meta

# Test from weaviate_mcp container
docker exec weaviate-mcp python -c "import socket; s = socket.socket(); result = s.connect_ex(('weaviate', 8080)); print('OK' if result == 0 else 'FAIL')"

# Check logs
docker compose logs weaviate_mcp
```

### MySQL connection issues

```bash
# Test connection from VM
docker exec -it querylab-mysql mysql -u querylab -p

# Test from container
docker exec beat-mysql-mcp python -c "import socket; s = socket.socket(); result = s.connect_ex(('mysql', 3306)); print('OK' if result == 0 else 'FAIL')"
```

### Authentication/Login not working

```bash
# Verify SECRET_KEY is set
docker exec querylab-orchestrator printenv | grep SECRET_KEY

# Verify database connection
docker exec querylab-orchestrator printenv | grep BACKEND_DB

# Check orchestrator logs
docker compose logs orchestrator | grep -i auth
```

---

## Part 7: Health Checks

Create a simple health check script:

```bash
cat > /opt/querylab/health-check.sh <<'EOF'
#!/bin/bash
echo "=== Query Labs Health Check ==="
echo ""
echo "Agents API:"
curl -s http://localhost:8000/health || echo "FAILED"
echo ""
echo "Orchestrator API:"
curl -s http://localhost:8084/api/data_source/ | jq -r 'length' || echo "FAILED"
echo ""
echo "Docker Containers:"
docker compose ps
EOF

chmod +x /opt/querylab/health-check.sh
```

Run health check:
```bash
/opt/querylab/health-check.sh
```

---

## Part 8: HTTPS via Let's Encrypt (native nginx + certbot)

nginx runs directly on the VM (installed via `apt`), **not** as a Docker
container — it sits in front of the Dockerized `frontend` (host port 5174)
and `orchestrator` (host port 8084) as a reverse proxy, and certbot's nginx
plugin manages the certificate for `YOUR_DOMAIN.com` in place.

### Step 1: DNS

Confirm `YOUR_DOMAIN.com` has an A record pointing at this VM's public IP
(check with `dig YOUR_DOMAIN.com` or `nslookup YOUR_DOMAIN.com`). Let's
Encrypt validates ownership over HTTP on port 80, so this must resolve
before requesting a cert — it will not issue for a bare IP.

### Step 2: Firewall

Open ports 80 and 443 (see Part 5 above).

### Step 3: Install nginx

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install nginx -y
systemctl status nginx
```

### Step 4: Point nginx at the app

Certbot's nginx plugin only adds TLS to a server block that already
exists — it won't create the proxy rules. Create one:

```bash
sudo nano /etc/nginx/sites-available/YOUR_DOMAIN.com
```

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com;

    location /api/ {
        proxy_pass http://127.0.0.1:8084/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:5174/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/YOUR_DOMAIN.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

`http://YOUR_DOMAIN.com` should now show the actual frontend, not the
default nginx welcome page.

### Step 5: Install certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### Step 6: Generate the certificate

```bash
sudo certbot --nginx
```

- Email → yours (renewal/expiry notices)
- Agree to terms → `Y`
- Choose domain → `YOUR_DOMAIN.com` (present in the list because the
  server block from Step 4 already declares it)
- Redirect HTTP to HTTPS → `Yes`

Certbot edits `/etc/nginx/sites-available/YOUR_DOMAIN.com` in place: adds
`listen 443 ssl;`, the `ssl_certificate`/`ssl_certificate_key` paths, and
turns the port-80 block into a redirect.

### Step 7: Verify

```bash
curl -I https://YOUR_DOMAIN.com
```

Should return a valid HTTPS response with a trusted cert — no
`-k`/`--insecure` needed. In a browser, `https://YOUR_DOMAIN.com` shows the
padlock.

### Cert file locations

```
/etc/letsencrypt/live/YOUR_DOMAIN.com/fullchain.pem   ← certificate
/etc/letsencrypt/live/YOUR_DOMAIN.com/privkey.pem     ← private key, never share/commit
```

### Renewal

Fully automatic — the `certbot` apt package installs a systemd timer that
runs twice daily and only renews when the cert is within 30 days of
expiry. Verify it exists:

```bash
systemctl list-timers | grep certbot
```

### Known follow-up: frontend must call the API same-origin

`frontend/src/api/api.js` builds `baseURL` as
`http://${VITE_HOST_URL}:${VITE_PORT_BACKEND_SQL}/api` (hardcoded `http://`,
baked in at Vite build time). Once the frontend is served over
`https://YOUR_DOMAIN.com`, that hardcoded `http://IP:8084` call will be
blocked by the browser as mixed content. Before relying on the domain in
production, point the frontend at the proxied path (e.g. same-origin
`/api`, served through nginx) rather than the raw IP:port — this needs a
small code/build change, not just infra config, so it's called out here
rather than done as part of the cert setup.

### Once HTTPS is confirmed working

Consider removing the direct `8084:8082` / `5174:5173` port publishes in
`docker-compose.yaml` (or restricting their firewall rules to internal
GCP IP ranges) so the app is only reachable through nginx on 80/443 — this
is a deliberate follow-up, not automatic, since it changes what's reachable
from the internet.

---

## Quick Reference

| Service | Internal Port | External Port | URL |
|---------|--------------|---------------|-----|
| Agents | 8000 | 8000 | http://15.207.111.124:8000 |
| Orchestrator | 8082 | 8084 | http://15.207.111.124:8084 |
| mysql_mcp (revenue) | 8000 | 8005 | Internal only |
| beat_mcp | 8000 | 8006 | Internal only |
| meridian_mcp | 8000 | 8007 | Internal only |
| weaviate_mcp | 8001 | 8003 | Internal only |
| Frontend | 5173 | 5174 | http://15.207.111.124:5174 |

---

## Automated Deployment Script

For automated redeployment, use the provided `deploy-to-vm.sh` script in this folder.
