# ProxyOS 0.3.0 RC8

ProxyOS is an x86-64 OpenWrt derivative focused on one job: assigning an
independent sing-box outbound to every LAN or Wi-Fi client.

This repository contains a reproducible OpenWrt ImageBuilder project. It does
not contain a renamed stock image or a placeholder firmware file.

## 0.3.0 RC8 scope

- OpenWrt 25.12.5 x86-64, UEFI and legacy BIOS images
- A custom responsive Web console
- OpenWrt `rpcd`/`ubus` authentication
- Device discovery from DHCP leases and the neighbour table
- Fast two-second LAN presence tracking with FDB activity, five-second UI
  refresh, immediate offline display, and automatic hiding of profiles that
  have not returned for seven days
- External AP/router topology classification: infrastructure devices and their
  downstream clients are shown separately, with per-client proxy assignment
- One consistent online-state model across Overview, Devices, and Wi-Fi;
  infrastructure devices are excluded from client totals
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
- A dedicated external AP/router management view when no local AP-capable radio
  is present
- Physical port inventory and WAN/LAN assignment with a 90-second rollback
- Multi-WAN and multi-LAN role assignment. Two-or-more-port systems require at
  least one WAN and one LAN; a one-port system prioritizes WAN as requested.
- Authenticated remote egress profiles for every active WAN and directly
  attached wired computer. Both HTTP CONNECT and SOCKS5 credentials follow the
  selected local device policy without changing the remote client settings.
- Optional Tailscale tunnel support for CGNAT environments. It is disabled by
  default and, when enabled, does not accept routes, replace DNS, or advertise
  ProxyOS as an exit node.
- WAN hotplug refresh keeps broadband profiles and bind-interface selection in
  sync when a new uplink is connected.
- Portable first-boot port detection that excludes bridges, virtual adapters,
  TUN interfaces, and wireless devices before probing an upstream DHCP port
- A boot-time platform doctor and read-only `proxyos-selftest` covering WAN,
  LAN bridge, DNS, subscription parser, required tools, and device discovery
- Safe configuration validation before sing-box restart
- Reference-matched overview, device, node, and Wi-Fi management screens
- Unified Chinese typography, tabular network numbers, consistent line icons,
  country flags, AP/router glyphs, and responsive state badges
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
- Device block policies are enforced by an isolated nftables table and are
  restored at service startup
- Update checks that degrade gracefully when no public release channel has
  been configured yet and never offer an older release candidate as an update

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
- Direct WAN remote access requires a reachable public IPv4/IPv6 address or an
  upstream port mapping. Carrier-grade NAT needs a private tunnel such as the
  optional Tailscale integration.

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
- With only one Ethernet port: it is assigned to WAN first; use a local console
  or preconfigure an alternate management interface before relying on it as the
  only management path

Set the root password immediately after first login. Do not expose an
unconfigured release candidate to an untrusted network.
