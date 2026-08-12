#!/usr/bin/env bash
set -euo pipefail

OPENWRT_VERSION="${OPENWRT_VERSION:-25.12.5}"
TARGET="x86"
SUBTARGET="64"
PROFILE="generic"
ROOTFS_PARTSIZE="${ROOTFS_PARTSIZE:-1024}"
TAILSCALE_VERSION="${TAILSCALE_VERSION:-1.98.10}"
TAILSCALE_SHA256="52490ce0832b245857e2afef7426d6ae5a4b49fb391412833cc95729bd23f7de"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROXYOS_VERSION="$(tr -d '\r\n[:space:]' < "${PROJECT_DIR}/VERSION")"
RELEASE_LABEL="Final-${PROXYOS_VERSION}"
WORK_DIR="${PROJECT_DIR}/.build"
DIST_DIR="${PROJECT_DIR}/dist"
BASE_URL="https://downloads.openwrt.org/releases/${OPENWRT_VERSION}/targets/${TARGET}/${SUBTARGET}"
ARCHIVE="openwrt-imagebuilder-${OPENWRT_VERSION}-x86-64.Linux-x86_64.tar.zst"
IMAGEBUILDER_DIR="${WORK_DIR}/openwrt-imagebuilder-${OPENWRT_VERSION}-x86-64.Linux-x86_64"
TAILSCALE_ARCHIVE="tailscale_${TAILSCALE_VERSION}_amd64.tgz"
STAGED_ROOTFS="${WORK_DIR}/proxyos-rootfs"

for command_name in curl sha256sum tar make gzip; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "Missing required command: ${command_name}" >&2
    exit 1
  }
done

mkdir -p "${WORK_DIR}" "${DIST_DIR}"
chmod 0755 \
  "${PROJECT_DIR}/rootfs/etc/init.d/proxyos" \
  "${PROJECT_DIR}/rootfs/etc/init.d/proxyos-health" \
  "${PROJECT_DIR}/rootfs/etc/init.d/proxyos-lan-watch" \
  "${PROJECT_DIR}/rootfs/etc/init.d/proxyos-platform-doctor" \
  "${PROJECT_DIR}/rootfs/etc/init.d/proxyos-port-detect" \
  "${PROJECT_DIR}/rootfs/etc/init.d/tailscaled" \
  "${PROJECT_DIR}/rootfs/etc/hotplug.d/iface/95-proxyos-remote-access" \
  "${PROJECT_DIR}/rootfs/etc/uci-defaults/99-proxyos" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyosctl" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/proxyos-dhcp-event" \
  "${PROJECT_DIR}/rootfs/usr/libexec/proxyos/subscription_parser.py" \
  "${PROJECT_DIR}/rootfs/usr/libexec/rpcd/proxyos" \
  "${PROJECT_DIR}/rootfs/usr/sbin/proxyos-detect-ports" \
  "${PROJECT_DIR}/rootfs/usr/sbin/proxyos-platform-doctor" \
  "${PROJECT_DIR}/rootfs/usr/sbin/proxyos-selftest" \
  "${PROJECT_DIR}/rootfs/usr/sbin/proxyos-watch-lan"

if [[ ! -f "${WORK_DIR}/${TAILSCALE_ARCHIVE}" ]]; then
  echo "[1/6] Downloading Tailscale ${TAILSCALE_VERSION} static binaries"
  curl --fail --location --retry 3 \
    "https://pkgs.tailscale.com/stable/${TAILSCALE_ARCHIVE}" \
    --output "${WORK_DIR}/${TAILSCALE_ARCHIVE}"
fi
echo "${TAILSCALE_SHA256}  ${WORK_DIR}/${TAILSCALE_ARCHIVE}" | sha256sum --check
rm -rf "${STAGED_ROOTFS}" "${WORK_DIR}/tailscale_${TAILSCALE_VERSION}_amd64"
mkdir -p "${STAGED_ROOTFS}/usr/sbin"
cp -a "${PROJECT_DIR}/rootfs/." "${STAGED_ROOTFS}/"
tar -xzf "${WORK_DIR}/${TAILSCALE_ARCHIVE}" -C "${WORK_DIR}"
install -m 0755 "${WORK_DIR}/tailscale_${TAILSCALE_VERSION}_amd64/tailscale" "${STAGED_ROOTFS}/usr/sbin/tailscale"
install -m 0755 "${WORK_DIR}/tailscale_${TAILSCALE_VERSION}_amd64/tailscaled" "${STAGED_ROOTFS}/usr/sbin/tailscaled"

if [[ ! -f "${WORK_DIR}/${ARCHIVE}" ]]; then
  echo "[2/6] Downloading OpenWrt ${OPENWRT_VERSION} ImageBuilder"
  curl --fail --location --retry 3 \
    "${BASE_URL}/${ARCHIVE}" \
    --output "${WORK_DIR}/${ARCHIVE}"
fi

echo "[3/6] Verifying official OpenWrt checksum"
curl --fail --location --retry 3 \
  "${BASE_URL}/sha256sums" \
  --output "${WORK_DIR}/sha256sums"
EXPECTED_LINE="$(grep -F " *${ARCHIVE}" "${WORK_DIR}/sha256sums" || true)"
if [[ -z "${EXPECTED_LINE}" ]]; then
  echo "The official checksum list does not contain ${ARCHIVE}" >&2
  exit 1
fi
(
  cd "${WORK_DIR}"
  printf '%s\n' "${EXPECTED_LINE}" | sha256sum --check -
)

if [[ ! -d "${IMAGEBUILDER_DIR}" ]]; then
  echo "[4/6] Extracting ImageBuilder"
  tar --use-compress-program=unzstd -xf "${WORK_DIR}/${ARCHIVE}" -C "${WORK_DIR}"
fi

PACKAGES=(
  "-dnsmasq"
  "dnsmasq-full"
  "sing-box"
  "kmod-tun"
  "nftables-json"
  "ip-full"
  "jq"
  "python3-light"
  "python3-urllib"
  "python3-yaml"
  "curl"
  "ca-bundle"
  "coreutils-base64"
  "uhttpd"
  "uhttpd-mod-ubus"
  "rpcd"
  "rpcd-mod-file"
  "rpcd-mod-iwinfo"
  "iw"
  "iwinfo"
  "usteer"
  "lldpd"
  "umdns"
  "ip-bridge"
  "iputils-arping"
  "wifi-scripts"
  "wireless-regdb"
  "wpad-basic-mbedtls"
  "ethtool"
  "pciutils"
  "kmod-igc"
  "kmod-igb"
  "kmod-e1000"
  "kmod-e1000e"
  "kmod-tg3"
  "kmod-sky2"
  "kmod-forcedeth"
  "kmod-atlantic"
  "kmod-r8169"
  "kmod-r8125"
  "kmod-ixgbe"
  "kmod-i40e"
  "kmod-vmxnet3"
  "kmod-usb-net-rtl8152"
  "kmod-usb-net-asix"
  "kmod-usb-net-asix-ax88179"
  "kmod-iwlwifi"
  "iwlwifi-firmware-ax200"
  "iwlwifi-firmware-ax201"
  "iwlwifi-firmware-ax210"
  "kmod-mt7921e"
  "kmod-mt7921u"
  "kmod-ath9k"
)

echo "[5/6] Building ProxyOS images"
make -C "${IMAGEBUILDER_DIR}" image \
  PROFILE="${PROFILE}" \
  PACKAGES="${PACKAGES[*]}" \
  FILES="${STAGED_ROOTFS}" \
  ROOTFS_PARTSIZE="${ROOTFS_PARTSIZE}"

echo "[6/6] Collecting release artifacts"
SOURCE_DIR="${IMAGEBUILDER_DIR}/bin/targets/${TARGET}/${SUBTARGET}"
EFI_SOURCE="$(find "${SOURCE_DIR}" -maxdepth 1 -name '*squashfs-combined-efi.img.gz' -print -quit)"
BIOS_SOURCE="$(find "${SOURCE_DIR}" -maxdepth 1 -name '*squashfs-combined.img.gz' ! -name '*efi*' -print -quit)"

if [[ -z "${EFI_SOURCE}" || -z "${BIOS_SOURCE}" ]]; then
  echo "Expected x86 images were not produced." >&2
  exit 1
fi

cp "${EFI_SOURCE}" "${DIST_DIR}/ProxyOS-${OPENWRT_VERSION}-${RELEASE_LABEL}-x86_64-UEFI.img.gz"
cp "${BIOS_SOURCE}" "${DIST_DIR}/ProxyOS-${OPENWRT_VERSION}-${RELEASE_LABEL}-x86_64-BIOS.img.gz"
(
  cd "${DIST_DIR}"
  sha256sum ./*.img.gz > SHA256SUMS
  gzip -t ./*.img.gz
  sha256sum --check SHA256SUMS
)

echo "Build complete: ${DIST_DIR}"

echo "[AIC8800] Building USB Wi-Fi packages against the same OpenWrt release"
(
  cd "${PROJECT_DIR}"
  bash ./build-aic8800-openwrt.sh
)
cp "${PROJECT_DIR}"/aic8800-artifact/*.apk "${DIST_DIR}/"
cp "${PROJECT_DIR}"/aic8800-artifact/SHA256SUMS "${DIST_DIR}/AIC8800-SHA256SUMS"
