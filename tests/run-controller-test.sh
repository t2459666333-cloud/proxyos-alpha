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
cat > "${STATE_DIR}/remote-access.json" <<'EOF'
{
  "enabled": true,
  "wan_enabled": true,
  "port": 10808,
  "users": [
    {"mac":"AA:BB:CC:DD:EE:01","username":"lan-pc","password":"LanPassword123456","enabled":true},
    {"mac":"AA:BB:CC:DD:EE:02","username":"blocked-pc","password":"BlockPassword123456","enabled":true},
    {"mac":"__WAN__:wan2","username":"wan-wan2","password":"WanPassword123456","enabled":true,"interface":"wan2","bind_interface":"eth2"}
  ]
}
EOF
chmod 0755 \
  "${PROJECT_DIR}/tests/mocks/uci" \
  "${PROJECT_DIR}/tests/mocks/ubus" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/subscription_parser.py"
export PATH="${PROJECT_DIR}/.tools-cache:${PROJECT_DIR}/tests/mocks:${PATH}"
export PYTHONPATH="${PROJECT_DIR}/.tools-cache/python${PYTHONPATH:+:${PYTHONPATH}}"
export PROXYOS_SKIP_RESTART=1
export PROXYOS_SKIP_FIREWALL=1
export PROXYOS_SKIP_DHCP=1
export PROXYOS_SKIP_PREFLIGHT=1
export PROXYOS_PARSER="${PROJECT_DIR}/rootfs/usr/libexec/proxyos/subscription_parser.py"
export PROXYOS_SKIP_PUBLIC_IP=1
if [[ "${OS:-}" == "Windows_NT" ]]; then
  export PROXYOS_SKIP_CONFIG_CHECK=1
  export PROXYOS_PYTHON=python
fi
if [[ -n "${PROXYOS_SINGBOX:-}" ]]; then
  export PROXYOS_SINGBOX
elif [[ -x "${PROJECT_DIR}/.tools-cache/sing-box" ]]; then
  export PROXYOS_SINGBOX="${PROJECT_DIR}/.tools-cache/sing-box"
else
  export PROXYOS_SKIP_CONFIG_CHECK=1
fi

PROXYOS_STATE_DIR="${STATE_DIR}" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" generate >/dev/null

jq -e '
  any(.inbounds[]; .tag == "proxyos-remote" and .type == "mixed" and .listen_port == 10808) and
  any(.outbounds[]; .tag == "direct-wan-wan2" and .bind_interface == "eth2") and
  any(.route.rules[]; .inbound == ["proxyos-remote"] and .auth_user == ["lan-pc"] and .outbound == "node-hk01") and
  any(.route.rules[]; .inbound == ["proxyos-remote"] and .auth_user == ["blocked-pc"] and .action == "reject") and
  any(.route.rules[]; .inbound == ["proxyos-remote"] and .auth_user == ["wan-wan2"] and .outbound == "direct-wan-wan2")
' "${STATE_DIR}/sing-box.json" >/dev/null

VERSION_TEST="${STATE_DIR}/version-compare.sh"
sed -n '/^version_is_newer() {$/,/^}$/p' \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" > "${VERSION_TEST}"
# shellcheck disable=SC1090
. "${VERSION_TEST}"
version_is_newer "0.3.0-rc7" "0.3.0-rc8" && {
  echo "Older release candidates must not be offered as updates" >&2
  exit 1
}
version_is_newer "0.3.0-rc9" "0.3.0-rc8" || {
  echo "Newer release candidates must be detected" >&2
  exit 1
}
version_is_newer "0.3.0" "0.3.0-rc8" || {
  echo "A stable release must supersede its release candidate" >&2
  exit 1
}
version_is_newer "0.3.0-rc8" "0.3.0" && {
  echo "A release candidate must not replace the stable release" >&2
  exit 1
}
version_is_newer "0.3.1" "0.3.0" || {
  echo "A newer numeric version must be detected" >&2
  exit 1
}

for list_command in devices nodes ports subscriptions; do
  PROXYOS_STATE_DIR="${STATE_DIR}" \
    "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" "${list_command}" |
    jq -e '.items | type == "array"' >/dev/null
done

mkdir -p "${STATE_DIR}/ip-type-api"
cat > "${STATE_DIR}/ip-type-api/203.0.113.10" <<'EOF'
{"risk":{"is_datacenter":true}}
EOF
PROXYOS_STATE_DIR="${STATE_DIR}" \
PROXYOS_IP_TYPE_FIXED_EXIT_IP="203.0.113.10" \
PROXYOS_IP_TYPE_PRIMARY_URL="file://${STATE_DIR}/ip-type-api" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" node-ip-type-test \
  '{"id":"hk01"}' |
  jq -e '.ok == true and .ip_type == "datacenter" and .exit_ip == "203.0.113.10"' >/dev/null
jq -e 'any(.[]; .id == "hk01" and .ip_type == "datacenter" and .ip_type_status == "complete")' \
  "${STATE_DIR}/nodes.json" >/dev/null

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

# A device policy change must be written transactionally and regenerated into
# the effective sing-box source-IP route.
PROXYOS_STATE_DIR="${STATE_DIR}" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" device-bind \
  '{"mac":"AA:BB:CC:DD:EE:03","ip":"192.168.10.103","name":"Direct test","policy":"direct","node_id":"","backup_node_id":"","failure_mode":"block","auto_source":"all"}' |
  jq -e '.ok == true' >/dev/null
jq -e '
  any(.[]; .mac == "AA:BB:CC:DD:EE:03" and .policy == "direct")
' "${STATE_DIR}/devices.json" >/dev/null
jq -e '
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.103/32"] and .outbound == "direct")
' "${STATE_DIR}/sing-box.json" >/dev/null

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
PROXYOS_STATE_DIR="${STATE_DIR}" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" subscription-save \
  "$(jq -nc --arg id "$subscription_id" \
    '{id:$id,name:"Renamed controller subscription",url:"https://example.com/proxyos-test"}')" |
  jq -e '.ok == true' >/dev/null
PROXYOS_STATE_DIR="${STATE_DIR}" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" subscription-get \
  "$(jq -nc --arg id "$subscription_id" '{id:$id}')" |
  jq -e '.name == "Renamed controller subscription" and .url == "https://example.com/proxyos-test"' >/dev/null

if [[ "${PROXYOS_SKIP_CONFIG_CHECK:-0}" != "1" ]]; then
  mixed_fixture="${PROJECT_DIR}/tests/fixtures/mixed-subscription.json"
  mixed_url="file://${mixed_fixture}"
  mixed_add="$(
    PROXYOS_STATE_DIR="${STATE_DIR}" \
      "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" subscription-add \
      "$(jq -nc --arg url "$mixed_url" '{name:"Mixed subscription",url:$url}')"
  )"
  mixed_id="$(printf '%s' "$mixed_add" | jq -r '.id')"
  PROXYOS_STATE_DIR="${STATE_DIR}" \
    "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" subscription-update \
    "$(jq -nc --arg id "$mixed_id" '{id:$id}')" |
    jq -e '.ok == true and .node_count == 1 and .skipped_count == 1 and .detected_count == 2' >/dev/null
  jq -e --arg id "$mixed_id" \
    'any(.[]; .id == $id and .status == "ok" and .node_count == 1 and .skipped_count == 1)' \
    "${STATE_DIR}/subscriptions.json" >/dev/null
fi

echo "On-device controller generation test passed."
