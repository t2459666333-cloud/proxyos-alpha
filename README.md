# ProxyOS Alpha 0.2.0

ProxyOS is an x86-64 OpenWrt derivative focused on one job: assigning an
independent sing-box outbound to every LAN or Wi-Fi client.

This repository contains a reproducible OpenWrt ImageBuilder project. It does
not contain a renamed stock image or a placeholder firmware file.

## Alpha 0.2.0 scope

- OpenWrt 25.12.5 x86-64, UEFI and legacy BIOS images
- A custom responsive Web console
- OpenWrt `rpcd`/`ubus` authentication
- Device discovery from DHCP leases and the neighbour table
- Per-device policies: fixed node, automatic node, direct, block, or system default
- Per-device backup node and block/direct/backup failure behavior
- Manual sing-box outbound import (all protocols supported by the installed
  sing-box build can be represented as raw outbound JSON)
- sing-box configuration generation with `source_ip_cidr` routing
- TUN plus `auto_route` and `auto_redirect`
- Auto-detected sing-box JSON, Clash YAML/JSON, Base64, and share-link subscriptions
- Node editing, health tests, per-node egress-IP checks, and five-minute health refresh
- Wi-Fi/AP capability detection, radio toggle, radio settings, client disconnect,
  and an isolated guest network
- Physical port inventory and WAN/LAN assignment with a 90-second rollback
- Safe configuration validation before sing-box restart
- Reference-matched overview, device, node, and Wi-Fi management screens
- Node TCP latency test and direct egress-IP check
- Structured runtime errors for all parameterized Web actions
- Configuration backup/restore, password changes, logs, and controlled reboot

## Deliberate Alpha limitations

- Clash subscriptions import proxy nodes, not Clash routing rules, proxy groups,
  or rule providers. ProxyOS owns routing so that per-device policies remain deterministic.
- Per-device encrypted DNS paths are generated, but still require hardware
  leak testing. LAN IPv6 is disabled as a conservative default.
- The first x86 image must be validated in a VM before it is written to a
  physical router.
- Wireless support depends on the installed chipset and driver. Detection is
  accurate; universal AP-mode support cannot be guaranteed on x86.
- Protocol-specific forms cover common fields; uncommon sing-box fields remain
  available through raw outbound JSON.
- Firmware upload/sysupgrade and signed online updates are not exposed yet.

## Build

The OpenWrt ImageBuilder is a Linux x86-64 program. On Ubuntu/Debian:

```sh
sudo apt update
sudo apt install -y build-essential curl zstd tar gzip coreutils
bash ./scripts/build-image.sh
```

Artifacts are written to `dist/`.

## Local UI preview

On any machine with Node.js 20 or later:

```sh
npm run preview
```

Open `http://127.0.0.1:4173`. The preview server provides mock hardware and
device data; it does not alter the host network.

## First boot

- Management address: `http://192.168.10.1`
- User: `root`
- Initial password: blank, matching stock OpenWrt first boot
- With two or more physical Ethernet ports: first port is WAN, remaining ports
  are LAN
- With only one Ethernet port: it remains LAN to avoid locking out management

Set the root password immediately after first login. Do not expose an Alpha
build to an untrusted network.
