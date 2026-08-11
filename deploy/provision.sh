#!/usr/bin/env bash
# =============================================================================
# One-time provisioning for a fresh Hetzner box (Debian 12 / Ubuntu 24.04).
#
# Run as root on the server:
#   bash provision.sh
#
# Installs Docker, creates a deploy user, and locks the firewall down to SSH
# and HTTP(S). It does not deploy the app — deploy.sh does that.
# =============================================================================
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-osora}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root." >&2
  exit 1
fi

echo "→ Updating packages"
apt-get update -qq
apt-get upgrade -y -qq

echo "→ Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "→ Creating deploy user '${DEPLOY_USER}'"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

# Carry root's authorised keys over so you can log in as the deploy user.
if [[ -f /root/.ssh/authorized_keys ]]; then
  mkdir -p "/home/${DEPLOY_USER}/.ssh"
  cp /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
  chmod 700 "/home/${DEPLOY_USER}/.ssh"
  chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
fi

echo "→ Firewall"
apt-get install -y -qq ufw
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "→ Hardening SSH (password auth off)"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd || true

mkdir -p /srv/osora
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /srv/osora

cat <<EOF

Provisioning complete.

  Deploy user : ${DEPLOY_USER}
  App root    : /srv/osora
  Open ports  : 22, 80, 443

Next:
  1. Point your domain's A record at this server.
  2. Copy the repo to /srv/osora (git clone, or rsync from your machine).
  3. Create /srv/osora/.env.production — see .env.example.
  4. Run deploy/deploy.sh from /srv/osora.
EOF
