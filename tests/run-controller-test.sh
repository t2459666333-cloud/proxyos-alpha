#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${PROJECT_DIR}/.test-state"

mkdir -p "${STATE_DIR}"
cp "${PROJECT_DIR}/rootfs/etc/proxyos/config-template.json" "${STATE_DIR}/config-template.json"
cp "${PROJECT_DIR}/tests/fixtures/nodes.json" "${STATE_DIR}/nodes.json"
cp "${PROJECT_DIR}/tests/fixtures/devices.json" "${STATE_DIR}/devices.json"
cp "${PROJECT_DIR}/rootfs/etc/proxyos/subscriptions.json" "${STATE_DIR}/subscriptions.json"
chmod 0755 "${PROJECT_DIR}/tests/mocks/uci" "${PROJECT_DIR}/tests/mocks/ubus"
export PATH="${PROJECT_DIR}/.tools-cache:${PROJECT_DIR}/tests/mocks:${PATH}"

PROXYOS_STATE_DIR="${STATE_DIR}" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" generate >/dev/null

jq -e '
  any(.outbounds[]; .tag == "node-hk01") and
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.101/32"] and .outbound == "node-hk01") and
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.102/32"] and .action == "reject") and
  any(.dns.rules[]; .source_ip_cidr == ["192.168.10.101/32"] and .server == "dns-node-hk01")
' "${STATE_DIR}/sing-box.json" >/dev/null

echo "On-device controller generation test passed."
