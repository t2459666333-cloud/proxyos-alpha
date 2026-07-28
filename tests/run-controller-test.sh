#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${PROJECT_DIR}/.test-state"

mkdir -p "${STATE_DIR}"
rm -rf "${STATE_DIR}/devices.json.migrate.lock"
cp "${PROJECT_DIR}/rootfs/etc/proxyos/config-template.json" "${STATE_DIR}/config-template.json"
cp "${PROJECT_DIR}/tests/fixtures/nodes.json" "${STATE_DIR}/nodes.json"
cp "${PROJECT_DIR}/tests/fixtures/devices.json" "${STATE_DIR}/devices.json"
cp "${PROJECT_DIR}/rootfs/etc/proxyos/subscriptions.json" "${STATE_DIR}/subscriptions.json"
chmod 0755 \
  "${PROJECT_DIR}/tests/mocks/uci" \
  "${PROJECT_DIR}/tests/mocks/ubus" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/subscription_parser.py"
export PATH="${PROJECT_DIR}/.tools-cache:${PROJECT_DIR}/tests/mocks:${PATH}"
export PYTHONPATH="${PROJECT_DIR}/.tools-cache/python${PYTHONPATH:+:${PYTHONPATH}}"
export PROXYOS_SKIP_RESTART=1
export PROXYOS_PARSER="${PROJECT_DIR}/rootfs/usr/libexec/proxyos/subscription_parser.py"
if [[ "${OS:-}" == "Windows_NT" ]]; then
  export PROXYOS_SKIP_CONFIG_CHECK=1
  export PROXYOS_PYTHON=python
fi
if [[ -n "${PROXYOS_SINGBOX:-}" ]]; then
  export PROXYOS_SINGBOX
elif [[ -x "${PROJECT_DIR}/.tools-cache/sing-box" ]]; then
  export PROXYOS_SINGBOX="${PROJECT_DIR}/.tools-cache/sing-box"
fi

PROXYOS_STATE_DIR="${STATE_DIR}" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" generate >/dev/null

for list_command in devices nodes ports subscriptions; do
  PROXYOS_STATE_DIR="${STATE_DIR}" \
    "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" "${list_command}" |
    jq -e '.items | type == "array"' >/dev/null
done

test_node="$(
  PROXYOS_STATE_DIR="${STATE_DIR}" \
    "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" node-add \
    '{"name":"Controller JSON test","outbound_json":"{\"type\":\"socks\",\"server\":\"127.0.0.1\",\"server_port\":9}"}'
)"
printf '%s' "$test_node" | jq -e '.ok == true and (.id | length > 0)' >/dev/null
test_node_id="$(printf '%s' "$test_node" | jq -r '.id')"
PROXYOS_STATE_DIR="${STATE_DIR}" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" node-delete \
  "$(jq -nc --arg id "$test_node_id" '{id:$id}')" |
  jq -e '.ok == true' >/dev/null

jq -e '
  any(.outbounds[]; .tag == "node-hk01") and
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.101/32"] and .outbound == "node-hk01") and
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.102/32"] and .action == "reject") and
  any(.dns.rules[]; .source_ip_cidr == ["192.168.10.101/32"] and .server == "dns-node-hk01")
' "${STATE_DIR}/sing-box.json" >/dev/null

# Regression: the dashboard used to launch several proxyosctl instances that
# all wrote devices.json.migrate. The fixed controller must survive a burst of
# concurrent reads while upgrading an old device record.
jq 'map(del(.backup_node_id, .failure_mode, .auto_source))' \
  "${STATE_DIR}/devices.json" > "${STATE_DIR}/devices-old.json"
mv "${STATE_DIR}/devices-old.json" "${STATE_DIR}/devices.json"
rm -f "${STATE_DIR}"/concurrent-*.json
for index in $(seq 1 24); do
  PROXYOS_STATE_DIR="${STATE_DIR}" \
    "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" nodes \
    > "${STATE_DIR}/concurrent-${index}.json" &
done
wait
for result in "${STATE_DIR}"/concurrent-*.json; do
  jq -e '.items | type == "array"' "$result" >/dev/null
done
jq -e 'all(.[]; has("backup_node_id") and has("failure_mode") and has("auto_source"))' \
  "${STATE_DIR}/devices.json" >/dev/null

# Exercise the complete controller subscription path, not only the parser.
subscription_fixture="${STATE_DIR}/subscription.yaml"
cat > "$subscription_fixture" <<'EOF'
proxies:
  - name: Hong Kong test
    type: vless
    server: hk.example.com
    port: 443
    uuid: controller-subscription-test
    tls: true
    servername: hk.example.com
EOF
fixture_path="$(cygpath -w "$subscription_fixture" 2>/dev/null || printf '%s' "$subscription_fixture")"
case "$fixture_path" in
  [A-Za-z]:*) subscription_url="file:///$(printf '%s' "$fixture_path" | sed 's#\\#/#g')" ;;
  *) subscription_url="file://${fixture_path}" ;;
esac
subscription_add="$(
  PROXYOS_STATE_DIR="${STATE_DIR}" \
    "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" subscription-add \
    "$(jq -nc --arg url "$subscription_url" '{name:"Controller subscription",url:$url}')"
)"
subscription_id="$(printf '%s' "$subscription_add" | jq -r '.id')"
PROXYOS_STATE_DIR="${STATE_DIR}" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" subscription-update \
  "$(jq -nc --arg id "$subscription_id" '{id:$id}')" |
  jq -e '.ok == true and .format == "clash-yaml" and .node_count == 1' >/dev/null
jq -e --arg id "$subscription_id" \
  'any(.[]; .source_id == $id and .outbound.type == "vless")' \
  "${STATE_DIR}/nodes.json" >/dev/null

echo "On-device controller generation test passed."
