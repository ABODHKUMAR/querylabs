# Deployment Methods - Complete Comparison

This guide helps you choose the best deployment method for your needs.

---

## Quick Comparison

| Feature | Bitbucket Pipelines | Automated Script | Manual |
|---------|---------------------|------------------|--------|
| **Setup Time** | 30-60 min (one-time) | 10-15 min | 5 min |
| **Deployment Time** | 5-10 min (automatic) | 5-10 min | 15-20 min |
| **Trigger** | Push to `main` | Run script | SSH + commands |
| **Best For** | Production, Teams | Quick deploys, Testing | Learning, Debug |
| **Skill Level** | Intermediate | Beginner-Intermediate | Beginner |
| **Prerequisites** | Bitbucket repo, SSH | SSH access, bash | SSH access only |
| **Maintenance** | Low (fully automated) | Medium (manual trigger) | High (all manual) |
| **Rollback** | Git revert + push | Re-run with old commit | Manual checkout |
| **Team Friendly** | ✅ Excellent | ⚠️ Limited | ❌ Not scalable |
| **Secrets Management** | ✅ Bitbucket Variables | ⚠️ Local .env file | ❌ Manual typing |
| **Health Checks** | ✅ Built-in | ✅ Included | ❌ Manual |
| **Deployment History** | ✅ Full history | ❌ None | ❌ None |
| **Zero Downtime** | ✅ Yes | ✅ Yes | ⚠️ Depends |
| **Recommended For** | Production | Development | Learning |

---

## Method 1: Bitbucket Pipelines (Recommended for Production) 🚀

### Overview
Fully automated CI/CD deployment triggered by git push. Every push to `main` automatically deploys to your VM.

### When to Use
- ✅ Production environments
- ✅ Team collaboration (multiple developers)
- ✅ Want deployment history and audit trail
- ✅ Need consistent, repeatable deployments
- ✅ Want to enforce deployment standards
- ✅ Already using Bitbucket

### Setup Process
1. **Read**: [BITBUCKET_SETUP.md](BITBUCKET_SETUP.md)
2. **Enable**: Bitbucket Pipelines in repository settings
3. **SSH Key**: Generate and add to Bitbucket + VM
4. **Configure**: Add 27 repository variables
5. **Commit**: `bitbucket-pipelines.yml` to repo root
6. **Test**: Push to `main` → auto-deploys

### Workflow
```
Developer → git push origin main
              ↓
Bitbucket Pipelines triggers
              ↓
1. Install SSH client
2. Configure SSH key  
3. Copy generate-env.sh to VM
4. SSH to VM with env vars
5. Generate .env files
6. git pull latest code
7. docker compose down
8. docker compose up --build -d
9. Health checks
10. Report success/failure
              ↓
Deployment complete (5-10 min)
```

### Pros
- ✅ **Zero-touch deployment**: Just push to git
- ✅ **Automatic health checks**: Catches failures immediately
- ✅ **Deployment history**: See all past deployments in Bitbucket
- ✅ **Secrets management**: Variables stored securely in Bitbucket
- ✅ **Team collaboration**: Multiple developers can deploy
- ✅ **Audit trail**: Know who deployed what and when
- ✅ **Consistent**: Same process every time
- ✅ **Rollback**: Git revert + push = automatic rollback

### Cons
- ❌ **Initial setup**: Takes 30-60 minutes to configure
- ❌ **Requires Bitbucket**: Must use Bitbucket repository
- ❌ **Learning curve**: Need to understand pipelines
- ❌ **Build minutes**: May count against Bitbucket plan limits

### Time Investment
- **Setup**: 30-60 minutes (one-time)
- **Per deployment**: 0 minutes (automatic)
- **Maintenance**: Minutes per month

### Files Used
- `bitbucket-pipelines.yml` - Pipeline configuration
- `scripts/generate-env.sh` - Environment file generator

### Documentation
- 📘 [BITBUCKET_SETUP.md](BITBUCKET_SETUP.md) - Complete setup guide
- 📋 [BITBUCKET_CHECKLIST.md](BITBUCKET_CHECKLIST.md) - Setup checklist

---

## Method 2: Automated Script 🖥️

### Overview
Local bash script that SSHs to VM and automates deployment. Run one command to deploy.

### When to Use
- ✅ Quick manual deployments
- ✅ Development/staging environments
- ✅ Don't want to set up CI/CD
- ✅ Testing deployment changes
- ✅ Single developer projects
- ✅ Want automation without Bitbucket

### Setup Process
1. **Read**: [QUICKSTART.md](QUICKSTART.md)
2. **SSH Key**: Ensure you can SSH to VM
3. **Configure**: Copy `env.template` → `.env.deploy`
4. **Edit**: Fill in all credentials in `.env.deploy`
5. **Deploy**: `source .env.deploy && ./deploy-to-vm.sh`

### Workflow
```
Developer → source .env.deploy
         → ./deploy-to-vm.sh
              ↓
Script execution
              ↓
1. Check environment variables
2. Test SSH connection
3. Check Docker on VM
4. Pull latest git code
5. Create all .env files on VM
6. docker compose build
7. docker compose up -d
8. Run health checks
9. Display summary
              ↓
Deployment complete (5-10 min)
```

### Pros
- ✅ **One command**: `./deploy-to-vm.sh`
- ✅ **Fast setup**: 10-15 minutes
- ✅ **No CI/CD required**: Works locally
- ✅ **Health checks included**: Automatic verification
- ✅ **Error handling**: Clear error messages
- ✅ **Repeatable**: Same result every time
- ✅ **Portable**: Works from any machine with bash

### Cons
- ❌ **Manual trigger**: Must run script each time
- ❌ **No deployment history**: No record of past deployments
- ❌ **Local secrets**: `.env.deploy` file contains credentials
- ❌ **Single user**: Not ideal for teams
- ❌ **Requires bash**: Needs Git Bash on Windows

### Time Investment
- **Setup**: 10-15 minutes (one-time)
- **Per deployment**: 1 minute to run script + 5-10 min wait
- **Maintenance**: Low

### Files Used
- `deploy-to-vm.sh` - Main deployment script
- `env.template` - Environment variable template
- `.env.deploy` - Your configured values (not committed)

### Documentation
- 📘 [QUICKSTART.md](QUICKSTART.md) - 5-step guide
- 📋 [CHECKLIST.md](CHECKLIST.md) - Deployment checklist

---

## Method 3: Manual Deployment 👨‍💻

### Overview
SSH to VM and manually create files, run Docker commands. Full control, no automation.

### When to Use
- ✅ First-time setup (learning the system)
- ✅ Troubleshooting deployment issues
- ✅ Understanding what happens under the hood
- ✅ Custom deployment needs
- ✅ No bash/scripting available
- ✅ Maximum control required

### Setup Process
1. **Read**: [VM_DEPLOYMENT_GUIDE.md](VM_DEPLOYMENT_GUIDE.md)
2. **SSH**: Connect to VM
3. **Manual**: Create each .env file by hand
4. **Deploy**: Run docker-compose commands
5. **Verify**: Manual health checks

### Workflow
```
Developer → SSH to VM
         → cd /opt/querylab
         → Manually create .env.agent
         → Manually create .env.orchestrator
         → Manually create .env.revenue.mcp
         → Manually create .env.beat.mcp
         → Manually create .env.meridian.mcp
         → Manually create .env.weaviate.mcp
         → git pull origin main
         → docker compose down
         → docker compose build
         → docker compose up -d
         → Manually test endpoints
              ↓
Deployment complete (15-20 min)
```

### Pros
- ✅ **Full control**: See exactly what's happening
- ✅ **Learning**: Understand deployment process
- ✅ **Troubleshooting**: Easy to debug issues
- ✅ **Flexibility**: Customize as needed
- ✅ **No dependencies**: Just SSH and Docker
- ✅ **Works anywhere**: No scripting required

### Cons
- ❌ **Time-consuming**: 15-20 minutes per deployment
- ❌ **Error-prone**: Easy to make typos
- ❌ **Not repeatable**: Different every time
- ❌ **No automation**: Everything manual
- ❌ **Not scalable**: Doesn't work for teams
- ❌ **No health checks**: Must test manually

### Time Investment
- **Setup**: 5 minutes (minimal)
- **Per deployment**: 15-20 minutes
- **Maintenance**: High (manual each time)

### Files Used
- None (all commands executed manually)

### Documentation
- 📘 [VM_DEPLOYMENT_GUIDE.md](VM_DEPLOYMENT_GUIDE.md) - Step-by-step manual guide
- 📋 [CHECKLIST.md](CHECKLIST.md) - Manual deployment checklist

---

## Decision Tree

### Choose Bitbucket Pipelines If:
- ✅ You have a Bitbucket repository
- ✅ This is a production environment
- ✅ You have a team of developers
- ✅ You deploy frequently (daily/weekly)
- ✅ You want deployment history
- ✅ You need an audit trail
- ✅ You want zero-touch deployment

### Choose Automated Script If:
- ✅ You want quick manual deploys
- ✅ You're working solo
- ✅ This is dev/staging environment
- ✅ You don't want to set up CI/CD
- ✅ You deploy occasionally
- ✅ You have bash available

### Choose Manual Deployment If:
- ✅ First time deploying (learning)
- ✅ Troubleshooting an issue
- ✅ Custom deployment requirements
- ✅ One-off deployment
- ✅ No automation tools available

---

## Migration Path

### Start Simple → Scale Up

**Stage 1: Learning (Manual)**
- Deploy manually 1-2 times
- Understand the process
- Verify everything works

**Stage 2: Development (Automated Script)**
- Set up `deploy-to-vm.sh`
- Quick deploys during development
- Test changes rapidly

**Stage 3: Production (Bitbucket Pipelines)**
- Configure CI/CD
- Automatic deployments
- Team collaboration

---

## Real-World Scenarios

### Scenario 1: Solo Developer, Dev Environment
**Recommendation**: Automated Script
- Quick to set up
- Fast deployments
- Good balance of automation and control

### Scenario 2: Team of 3+, Production
**Recommendation**: Bitbucket Pipelines
- Multiple developers need to deploy
- Need deployment history
- Want consistent process

### Scenario 3: Learning Query Labs for First Time
**Recommendation**: Manual Deployment (first time), then Automated Script
- Understand the components
- See what happens at each step
- Then automate for efficiency

### Scenario 4: Continuous Deployment
**Recommendation**: Bitbucket Pipelines
- Deploy every push to main
- Automatic testing + deployment
- Zero manual intervention

### Scenario 5: Troubleshooting Deployment Issue
**Recommendation**: Manual Deployment
- Full control over each step
- Can inspect files and logs
- Understand what's failing

---

## Hybrid Approach (Recommended)

For most teams, use a combination:

1. **First Deployment**: Manual (to learn)
2. **Development**: Automated Script (for speed)
3. **Production**: Bitbucket Pipelines (for reliability)

This gives you:
- ✅ Understanding of the system
- ✅ Fast development cycles
- ✅ Reliable production deployments

---

## Cost Comparison

| Method | Time Cost | Money Cost | Maintenance Cost |
|--------|-----------|------------|------------------|
| **Bitbucket Pipelines** | High setup, low ongoing | Build minutes* | Very low |
| **Automated Script** | Medium setup, medium ongoing | None | Low |
| **Manual** | Low setup, high ongoing | None | Very high |

*Bitbucket includes 50 free build minutes/month on free tier, more on paid plans.

---

## Summary Table

| Criteria | Best Method |
|----------|-------------|
| **First-time user** | Manual |
| **Solo developer** | Automated Script |
| **Production environment** | Bitbucket Pipelines |
| **Team collaboration** | Bitbucket Pipelines |
| **Frequent deployments** | Bitbucket Pipelines |
| **Occasional deployments** | Automated Script |
| **Learning the system** | Manual |
| **Troubleshooting** | Manual |
| **CI/CD pipeline** | Bitbucket Pipelines |
| **Quick manual deploy** | Automated Script |
| **Maximum automation** | Bitbucket Pipelines |
| **Maximum control** | Manual |

---

## Next Steps

### Ready to Deploy?

**For Production (Recommended):**
→ Start with [BITBUCKET_SETUP.md](BITBUCKET_SETUP.md)

**For Quick Manual Deploy:**
→ Start with [QUICKSTART.md](QUICKSTART.md)

**For Learning/Troubleshooting:**
→ Start with [VM_DEPLOYMENT_GUIDE.md](VM_DEPLOYMENT_GUIDE.md)

---

## Questions?

- **Don't know which to choose?** → Start with Manual, then Automated Script
- **Production deployment?** → Use Bitbucket Pipelines
- **Want to learn first?** → Start with VM_DEPLOYMENT_GUIDE.md
- **Want automation now?** → Use deploy-to-vm.sh script
- **Have Bitbucket already?** → Set up Pipelines

---

**All methods deploy the same system - choose based on your needs and environment.**
