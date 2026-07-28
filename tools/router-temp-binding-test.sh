#!/bin/sh
set -eu

STATE_DIR="${1:-/tmp/proxyos-test-state}"
CTL="${2:-/tmp/proxyosctl-0.2.2}"
DEVICE_MAC="${3:-F0:4E:A4:40:A1:21}"
DEVICE_IP="${4:-192.168.10.244}"

node_id="$(
	jq -r '
		[
			.[] |
			select(
				(.status // "unknown") != "error" and
				(.enabled // true)
			)
		][0].id // empty
	' "${STATE_DIR}/nodes.json"
)"
[ -n "$node_id" ] || {
	printf 'No available node was found for the temporary binding test.\n' >&2
	exit 1
}

payload="$(
	jq -nc \
		--arg mac "$DEVICE_MAC" \
		--arg ip "$DEVICE_IP" \
		--arg id "$node_id" \
		'{
			mac:$mac,
			ip:$ip,
			name:"ProxyOS temporary test device",
			policy:"fixed_node",
			node_id:$id,
			backup_node_id:"",
			failure_mode:"block",
			auto_source:"all"
		}'
)"

result="$(
	PROXYOS_STATE_DIR="$STATE_DIR" \
	PROXYOS_SKIP_RESTART=1 \
	PROXYOS_SKIP_DHCP=1 \
		"$CTL" device-bind "$payload"
)"
printf '%s\n' "$result" | jq -e '.ok == true' >/dev/null
/usr/bin/sing-box check -c "${STATE_DIR}/sing-box.json"
jq -e --arg id "$node_id" --arg ip "${DEVICE_IP}/32" '
	any(
		.route.rules[];
		.source_ip_cidr == [$ip] and
		.outbound == ("node-" + $id)
	)
' "${STATE_DIR}/sing-box.json" >/dev/null

printf 'Temporary real-node device binding test passed for node %s.\n' "$node_id"
