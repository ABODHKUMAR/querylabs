#!/bin/bash
# Test SSH connection for Bitbucket Pipelines debugging

echo "=== Testing SSH Connection ==="
echo "Target: ${GCP_VM_USER}@${GCP_VM_IP}"
echo ""

# Show key file details
echo "=== SSH Key File Info ==="
if [ -f ~/.ssh/deploy_key ]; then
    echo "✓ Key file exists"
    ls -la ~/.ssh/deploy_key
    echo "First line of key:"
    head -n 1 ~/.ssh/deploy_key
    echo "Last line of key:"
    tail -n 1 ~/.ssh/deploy_key
    echo "Total lines: $(wc -l < ~/.ssh/deploy_key)"
else
    echo "✗ Key file does not exist"
fi
echo ""

# Test connection
echo "=== Testing SSH Connection ==="
ssh -i ~/.ssh/deploy_key \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=~/.ssh/known_hosts \
    -o ConnectTimeout=10 \
    -v \
    ${GCP_VM_USER}@${GCP_VM_IP} \
    "echo 'SSH connection successful!'; whoami; hostname -I" 2>&1 | tail -20

echo ""
echo "=== Connection Test Complete ==="
