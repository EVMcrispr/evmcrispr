---
title: "proxies:upgrade-beacon"
---

Upgrade an UpgradeableBeacon to a new implementation, upgrading every beacon proxy that points to it at once.

## Syntax

```evml
proxies:upgrade-beacon <beacon> <implementation>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `beacon` | `address` | UpgradeableBeacon address |
| `implementation` | `address` | New implementation address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load proxies

set $beacon 0xabcdef0123456789abcdef0123456789abcdef01
proxies:upgrade-beacon $beacon 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

## Notes

- Every `BeaconProxy` pointing at the beacon starts using the new
  implementation immediately.
- Must be sent by the beacon's owner.

## See Also

- [proxies:upgrade](upgrade.md) — upgrade transparent/UUPS proxies
- [@proxies.beacon](../helpers/proxies.beacon.md) — find a proxy's beacon
