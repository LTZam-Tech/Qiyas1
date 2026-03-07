#!/usr/bin/env bash
# =============================================================================
# Qiyas Platform — Initial Server Setup
# Run once on a fresh Ubuntu/Debian server.
# Usage: ssh root@194.163.172.141 'bash -s' < scripts/setup-server.sh
# =============================================================================
set -euo pipefail

SERVER_USER="deploy"
APP_DIR="/opt/qiyas"

echo "=== Qiyas Server Setup ==="

# --- 1. System updates -------------------------------------------------------
echo "[1/7] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# --- 2. Install Docker -------------------------------------------------------
echo "[2/7] Installing Docker..."
if ! command -v docker &>/dev/null; then
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# --- 3. Install Docker Compose plugin ----------------------------------------
echo "[3/7] Ensuring Docker Compose plugin..."
apt-get install -y -qq docker-compose-plugin 2>/dev/null || true

# --- 4. Create deploy user ---------------------------------------------------
echo "[4/7] Creating deploy user..."
if ! id "$SERVER_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$SERVER_USER"
  usermod -aG docker "$SERVER_USER"
  mkdir -p /home/$SERVER_USER/.ssh
  cp /root/.ssh/authorized_keys /home/$SERVER_USER/.ssh/ 2>/dev/null || true
  chown -R $SERVER_USER:$SERVER_USER /home/$SERVER_USER/.ssh
  chmod 700 /home/$SERVER_USER/.ssh
  chmod 600 /home/$SERVER_USER/.ssh/authorized_keys 2>/dev/null || true
fi

# --- 5. Create application directory -----------------------------------------
echo "[5/7] Creating application directory..."
mkdir -p "$APP_DIR"
chown $SERVER_USER:$SERVER_USER "$APP_DIR"

# --- 6. Configure firewall ---------------------------------------------------
echo "[6/7] Configuring firewall..."
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp    # SSH
  ufw allow 80/tcp    # HTTP
  ufw allow 443/tcp   # HTTPS (future)
  ufw --force enable
fi

# --- 7. Enable Docker on boot ------------------------------------------------
echo "[7/7] Enabling Docker service..."
systemctl enable docker
systemctl start docker

echo ""
echo "=== Setup Complete ==="
echo "Application directory: $APP_DIR"
echo "Deploy user: $SERVER_USER"
echo ""
echo "Next steps:"
echo "  1. Copy .env.production to $APP_DIR/.env.production"
echo "  2. Run: scripts/deploy.sh"
