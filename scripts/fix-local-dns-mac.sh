#!/usr/bin/env bash
# Immediate fix when nesuxdesk.xyz shows DNS_PROBE_FINISHED_NXDOMAIN on macOS.
# Maps domain directly to the AWS server IP and uses reliable public DNS resolvers.
set -euo pipefail

DOMAIN="nesuxdesk.xyz"
IP="3.128.135.95"
HOSTS_LINE="${IP} ${DOMAIN} www.${DOMAIN}"

if grep -q "${DOMAIN}" /etc/hosts 2>/dev/null; then
  echo "Hosts entry for ${DOMAIN} already exists."
else
  echo "Adding hosts entry: ${HOSTS_LINE}"
  echo "${HOSTS_LINE}" | sudo tee -a /etc/hosts >/dev/null
fi

echo "Flushing DNS cache..."
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder 2>/dev/null || true

SERVICE=$(networksetup -listallnetworkservices 2>/dev/null | grep -E '^Wi-Fi$|^Ethernet$' | head -1 || true)
if [[ -n "$SERVICE" ]]; then
  echo "Setting DNS on '${SERVICE}' to 8.8.8.8 and 1.1.1.1..."
  sudo networksetup -setdnsservers "$SERVICE" 8.8.8.8 1.1.1.1
fi

echo ""
echo "Testing..."
if curl -sf --connect-timeout 8 "https://${DOMAIN}/api/health" >/dev/null; then
  echo "OK: https://${DOMAIN}/api/health"
else
  echo "Still failing — wait a few minutes or run scripts/setup-cloudflare-dns.sh"
fi
