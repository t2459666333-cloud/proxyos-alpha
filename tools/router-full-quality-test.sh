#!/bin/sh
set -eu

NODE_ID="${1:?node id required}"
PAYLOAD="$(jq -nc --arg id "$NODE_ID" '{id:$id}')"
START="$(date +%s)"
/usr/libexec/proxyos/proxyosctl node-test "$PAYLOAD"
END="$(date +%s)"
printf 'elapsed=%ss\n' "$((END - START))"
jq -c --arg id "$NODE_ID" '
	.[] |
	select(.id == $id) |
	{
		id,
		name,
		status,
		latency_domestic_ms,
		latency_foreign_ms,
		download_mbps,
		packet_loss_percent,
		stability_score,
		last_test
	}
' /etc/proxyos/nodes.json
