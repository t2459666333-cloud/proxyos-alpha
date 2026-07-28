#!/bin/sh
set -eu

CONTROLLER="${1:-/usr/libexec/proxyos/proxyosctl}"
TEST_STATE="$(mktemp -d /tmp/proxyos-staged-test.XXXXXX)"
trap 'rm -rf "$TEST_STATE"' EXIT

cp /etc/proxyos/config-template.json "$TEST_STATE/config-template.json"
printf '[]\n' > "$TEST_STATE/subscriptions.json"

cat > "$TEST_STATE/nodes.json" <<'EOF'
[
  {
    "id":"primary-error",
    "name":"Primary",
    "source_type":"subscription",
    "source_id":"sub-a",
    "enabled":true,
    "status":"error",
    "latency_ms":null,
    "outbound":{"type":"socks","server":"127.0.0.1","server_port":10081}
  },
  {
    "id":"backup-good",
    "name":"Backup",
    "source_type":"manual",
    "source_id":"",
    "enabled":true,
    "status":"available",
    "latency_ms":15,
    "outbound":{"type":"socks","server":"127.0.0.1","server_port":10082}
  }
]
EOF

cat > "$TEST_STATE/devices.json" <<'EOF'
[
  {
    "mac":"02:00:00:00:00:01",
    "ip":"192.168.10.201",
    "name":"Backup test",
    "policy":"fixed_node",
    "node_id":"primary-error",
    "backup_node_id":"backup-good",
    "failure_mode":"backup",
    "auto_source":"all"
  },
  {
    "mac":"02:00:00:00:00:02",
    "ip":"192.168.10.202",
    "name":"Automatic test",
    "policy":"auto_node",
    "node_id":"",
    "backup_node_id":"",
    "failure_mode":"block",
    "auto_source":"manual"
  },
  {
    "mac":"02:00:00:00:00:03",
    "ip":"192.168.10.203",
    "name":"Fail closed test",
    "policy":"fixed_node",
    "node_id":"missing",
    "backup_node_id":"",
    "failure_mode":"block",
    "auto_source":"all"
  },
  {
    "mac":"02:00:00:00:00:04",
    "ip":"192.168.10.204",
    "name":"Direct fallback test",
    "policy":"fixed_node",
    "node_id":"missing",
    "backup_node_id":"",
    "failure_mode":"direct",
    "auto_source":"all"
  }
]
EOF

# Keep the node-update validation expression compatible with the jq version
# shipped by OpenWrt, without touching the live ProxyOS service.
printf '%s\n' '{"type":"socks"}' | jq -e '
  type == "object" and
  (.type | type == "string") and
  (.type | IN("direct","block","selector","urltest") | not)
' >/dev/null

PROXYOS_STATE_DIR="$TEST_STATE" "$CONTROLLER" generate >/dev/null
sing-box check -c "$TEST_STATE/sing-box.json"

jq -e '
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.201/32"] and .outbound == "node-backup-good") and
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.202/32"] and .outbound == "node-backup-good") and
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.203/32"] and .action == "reject") and
  any(.route.rules[]; .source_ip_cidr == ["192.168.10.204/32"] and .outbound == "direct") and
  any(.dns.rules[]; .source_ip_cidr == ["192.168.10.201/32"] and .server == "dns-node-backup-good")
' "$TEST_STATE/sing-box.json" >/dev/null

echo "Staged ProxyOS controller test passed."
