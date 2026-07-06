---
title: "proxies:upgrade"
---

Upgrade an ERC-1967 proxy to a new implementation, detecting whether it is a transparent proxy (upgraded through its ProxyAdmin) or a UUPS proxy (upgraded through itself). Optionally calls an initializer on the new implementation.

## Syntax

```evml
proxies:upgrade <proxy> <implementation> [signature] [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proxy` | `address` | Proxy address |
| `implementation` | `address` | New implementation address |
| `[signature]` | `write-abi` | Function to call on the new implementation after upgrading (e.g. a reinitializer) |
| `[...params]` | `any` | Arguments matching the signature types |

<!-- HAND-WRITTEN -->

## Examples

```evml
load proxies

set $proxy 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

# Plain upgrade (transparent or UUPS is detected automatically)
proxies:upgrade $proxy 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# Upgrade and call a reinitializer on the new implementation
proxies:upgrade $proxy 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 initializeV2(uint256) 42
```

## Notes

- The proxy kind is detected from its ERC-1967 slots: a non-empty admin
  slot means a transparent proxy — the action targets its ProxyAdmin
  (`upgradeAndCall`); otherwise a non-empty implementation slot means UUPS —
  the action targets the proxy itself (`upgradeToAndCall`).
- Send the action from the right account: the ProxyAdmin owner for
  transparent proxies, or whatever `_authorizeUpgrade` requires for UUPS.
- Legacy transparent proxies administered directly by an EOA are upgraded
  through the proxy's own `upgradeToAndCall`.

## See Also

- [proxies:upgrade-beacon](upgrade-beacon.md) — upgrade beacon proxies
- [@proxies.implementation](../helpers/proxies.implementation.md) — read the implementation
- [@proxies.admin](../helpers/proxies.admin.md) — read the proxy admin
