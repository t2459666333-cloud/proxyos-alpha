# ProxyOS 0.3.0 RC6

ProxyOS is an x86-64 OpenWrt derivative focused on one job: assigning an
independent sing-box outbound to every LAN or Wi-Fi client.

This repository contains a reproducible OpenWrt ImageBuilder project. It does
not contain a renamed stock image or a placeholder firmware file.

## 0.3.0 RC6 scope

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
- Real node pagination and multi-device assignment from every node, including
  clear online/offline and current-assignment indicators
- Every node test measures the real proxy path to Baidu and Google in parallel,
  and stores the domestic and international latency independently
- Latency testing follows Mihomo/Clash URL-Test semantics: one HEAD request,
  no redirect following, a five-second timeout, and response-header timing.
  Failed nodes are reported as unavailable instead of receiving a synthetic
  high delay.
- Node tests are single-flight: duplicate requests fail immediately,
  interrupted tests terminate their temporary sing-box/curl process tree,
  and stale probe files are removed automatically.
- Wi-Fi/AP capability detection, radio toggle, radio settings, client disconnect,
  and an isolated guest network
- Physical port inventory and WAN/LAN assignment with a 90-second rollback
- Safe configuration validation before sing-box restart
- Reference-matched overview, device, node, and Wi-Fi management screens
- Real proxy-path latency and egress-IP checks with multi-endpoint fallback
- Direct bootstrap DNS for proxy server hostnames, preventing recursive
  node-resolution failures after a device is assigned to a node
- Portable first boot with empty user data, stable PCI-path port ordering,
  wireless-interface exclusion, and a safe single-port LAN mode
- LAN clients receive ProxyOS itself as DNS, and TCP/UDP port 53 is forcibly
  redirected to a dedicated sing-box DNS inbound. Client source addresses are
  preserved, so DNS follows each device's assigned node even when a client
  hard-codes a public resolver such as `8.8.8.8`.
- Supported radios are detected on first boot but remain disabled until the
  user explicitly enables Wi-Fi
- Structured runtime errors for all parameterized Web actions
- A 24-hour Web session, automatic in-memory session renewal, reduced background
  polling, and automatic refresh when the browser tab becomes active again
- Configuration backup/restore, password changes, logs, and controlled reboot
- Update checks that degrade gracefully when no public release channel has
  been configured yet

## Release-candidate limitations

- Clash subscriptions import proxy nodes, not Clash routing rules, proxy groups,
  or rule providers. ProxyOS owns routing so that per-device policies remain deterministic.
- Per-device encrypted DNS paths are generated, but still require hardware
  leak testing. LAN IPv6 is disabled as a conservative default.
- Each new hardware model must still be validated before it is used as the
  only production gateway.
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

Set the root password immediately after first login. Do not expose an
unconfigured release candidate to an untrusted network.
