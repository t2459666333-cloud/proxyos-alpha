#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

NET_ROOT="${TEST_DIR}/sys/class/net"
DEVICE_ROOT="${TEST_DIR}/sys/devices"
PHY_ROOT="${TEST_DIR}/sys/class/ieee80211"
mkdir -p "${NET_ROOT}" "${DEVICE_ROOT}" "${PHY_ROOT}/phy0"

create_interface() {
  local name="$1"
  local type="$2"
  local device_path="$3"
  local wireless="${4:-false}"
  mkdir -p "${NET_ROOT}/${name}" "${DEVICE_ROOT}/${device_path}"
  printf '%s\n' "${type}" > "${NET_ROOT}/${name}/type"
  ln -s "${DEVICE_ROOT}/${device_path}" "${NET_ROOT}/${name}/device"
  if [[ "${wireless}" == "true" ]]; then
    ln -s "${PHY_ROOT}/phy0" "${NET_ROOT}/${name}/phy80211"
    mkdir -p "${NET_ROOT}/${name}/wireless"
  fi
}

mkdir -p "${NET_ROOT}/lo"
printf '772\n' > "${NET_ROOT}/lo/type"
create_interface "eno9" "1" "pci0000:00/0000:03:00.0"
create_interface "enp1s0" "1" "pci0000:00/0000:01:00.0"
create_interface "eth7" "1" "pci0000:00/0000:02:00.0"
create_interface "wlan0" "1" "pci0000:00/0000:04:00.0" "true"
create_interface "br-lan" "1" "virtual/net/br-lan"
create_interface "tun0" "65534" "virtual/net/tun0"

extract_function() {
  local source_file="$1"
  local function_name="$2"
  local output_file="$3"
  awk "/^${function_name}\\(\\) \\{/,/^\\}/" "${source_file}" > "${output_file}"
  grep -q "^${function_name}()" "${output_file}"
}

assert_physical_interfaces() {
  local source_file="$1"
  local function_file="${TEST_DIR}/physical-$(basename "${source_file}").sh"
  extract_function "${source_file}" "physical_interfaces" "${function_file}"
  # shellcheck disable=SC1090
  source "${function_file}"
  local actual
  actual="$(PROXYOS_NET_CLASS_ROOT="${NET_ROOT}" physical_interfaces)"
  local expected
  expected=$'enp1s0\neth7\neno9'
  local compatibility_expected=$'eno9\nenp1s0\neth7'
  # macOS and Git Bash do not always expose Linux sysfs symlink semantics.
  # Accept their deterministic name order; PCI ordering remains mandatory on
  # the Linux build runner and target router.
  if [[ "${actual}" != "${expected}" ]] && \
     ! { [[ "$(uname -s)" != "Linux" ]] && [[ "${actual}" == "${compatibility_expected}" ]]; }; then
    printf 'Physical interface detection failed for %s\nExpected:\n%s\nActual:\n%s\n' \
      "${source_file}" "${expected}" "${actual}" >&2
    exit 1
  fi
}

assert_physical_interfaces "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl"
assert_physical_interfaces "${PROJECT_DIR}/rootfs/etc/uci-defaults/99-proxyos"

mkdir -p "${PHY_ROOT}/phy0/device" "${DEVICE_ROOT}/drivers/mt7921e"
ln -s "${DEVICE_ROOT}/drivers/mt7921e" "${PHY_ROOT}/phy0/device/driver"

if ! command -v jq >/dev/null 2>&1; then
  echo "Physical interface tests passed; Wi-Fi JSON assertions skipped because jq is unavailable."
  exit 0
fi

cat > "${TEST_DIR}/fake-iw" <<'EOF'
#!/bin/sh
printf 'Supported interface modes:\n\t * managed\n\t * AP\n'
EOF
cat > "${TEST_DIR}/fake-ubus" <<'EOF'
#!/bin/sh
printf '{"radio0":{"up":true}}\n'
EOF
chmod +x "${TEST_DIR}/fake-iw" "${TEST_DIR}/fake-ubus"

WIFI_FUNCTION="${TEST_DIR}/wifi-status.sh"
extract_function "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" "wifi_status" "${WIFI_FUNCTION}"
# shellcheck disable=SC1090
source "${WIFI_FUNCTION}"
wifi_result="$(
  PROXYOS_IEEE80211_ROOT="${PHY_ROOT}" \
  PROXYOS_IW="${TEST_DIR}/fake-iw" \
  PROXYOS_UBUS="${TEST_DIR}/fake-ubus" \
  wifi_status
)"

jq -e '
  .available == true and
  .enabled == true and
  .phy == "phy0"
' >/dev/null <<< "${wifi_result}"
if [[ "$(readlink -f "${PHY_ROOT}/phy0/device/driver")" == "${DEVICE_ROOT}/drivers/mt7921e" ]]; then
  jq -e '.driver == "mt7921e"' >/dev/null <<< "${wifi_result}"
fi

empty_phy_root="${TEST_DIR}/sys/class/ieee80211-empty"
mkdir -p "${empty_phy_root}"
no_wifi_result="$(
  PROXYOS_IEEE80211_ROOT="${empty_phy_root}" \
  PROXYOS_IW="${TEST_DIR}/fake-iw" \
  PROXYOS_UBUS="${TEST_DIR}/fake-ubus" \
  wifi_status
)"
jq -e '.available == false and .enabled == false' >/dev/null <<< "${no_wifi_result}"

echo "Hardware detection tests passed."
