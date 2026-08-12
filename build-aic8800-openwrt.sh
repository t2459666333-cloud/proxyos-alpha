#!/usr/bin/env bash
set -euo pipefail

OPENWRT_VERSION="25.12.5"
SDK_ARCHIVE="openwrt-sdk-25.12.5-x86-64_gcc-14.3.0_musl.Linux-x86_64.tar.zst"
SDK_SHA256="0c8df0151a1e88feb7c03d694d61f6a18d51872815b7c811d76e2b77504d5e9c"
LEDE_COMMIT="e8bce27462ab259ff61f33cf1d17b925f8e82f3d"
WORK_DIR="${RUNNER_TEMP:-/tmp}/aic8800-openwrt"
SDK_DIR="${WORK_DIR}/sdk"
OUTPUT_DIR="${PWD}/aic8800-artifact"

rm -rf "${WORK_DIR}" "${OUTPUT_DIR}"
mkdir -p "${SDK_DIR}" "${OUTPUT_DIR}"

curl --fail --location --retry 10 --retry-all-errors \
  "https://downloads.openwrt.org/releases/${OPENWRT_VERSION}/targets/x86/64/${SDK_ARCHIVE}" \
  --output "${WORK_DIR}/${SDK_ARCHIVE}"
echo "${SDK_SHA256}  ${WORK_DIR}/${SDK_ARCHIVE}" | sha256sum --check -
tar --use-compress-program=unzstd -xf "${WORK_DIR}/${SDK_ARCHIVE}" \
  -C "${SDK_DIR}" --strip-components=1

cd "${SDK_DIR}"
./scripts/feeds update base
./scripts/feeds install mac80211

package_dir="${SDK_DIR}/package/aic8800"
package_url="https://raw.githubusercontent.com/coolsnowwolf/lede/${LEDE_COMMIT}/package/kernel/aic8800"
mkdir -p "${package_dir}/patches"
curl --fail --location "${package_url}/Makefile" --output "${package_dir}/Makefile"
# The source is pinned by its full Git commit. Reproducible archive hashes can
# vary when OpenWrt's archive generator changes, so do not reuse LEDE's cache
# hash in a different SDK release.
sed -i 's/^PKG_MIRROR_HASH:=.*/PKG_MIRROR_HASH:=skip/' "${package_dir}/Makefile"
for patch_name in \
  010-fix-fall-through.patch \
  020-wireless-6.16.patch \
  030-update-firmware-path.patch \
  040-rename-module.patch \
  050-log-level.patch \
  060-fix-read-cpuid.patch; do
  curl --fail --location "${package_url}/patches/${patch_name}" \
    --output "${package_dir}/patches/${patch_name}"
done

cat >> .config <<'EOF'
CONFIG_PACKAGE_aic8800-usb-firmware=m
CONFIG_PACKAGE_kmod-aic8800-usb=m
EOF
make defconfig
make package/aic8800/download V=s
make package/aic8800/compile V=s -j"$(nproc)"

find "${SDK_DIR}/bin" -type f \
  \( -name 'aic8800-usb-firmware-*.apk' -o -name 'kmod-aic8800-usb-*.apk' \) \
  -exec cp -v '{}' "${OUTPUT_DIR}/" \;
test "$(find "${OUTPUT_DIR}" -type f | wc -l)" -eq 2
sha256sum "${OUTPUT_DIR}"/* > "${OUTPUT_DIR}/SHA256SUMS"
