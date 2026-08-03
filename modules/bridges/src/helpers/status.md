---
title: "@bridges:status"
---

Progress of a bridge transfer: pending, claimable, done, or unknown. Poll it with `loop until` to wait for a transfer to become claimable or arrive.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@bridges:status(transferId adapter? fromChain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `transferId` | `string` | Transaction hash of the bridge on the source chain |
| `[adapter]` | `bridge-adapter` | Adapter that initiated the transfer (default: detected from the source transaction) |
| `[fromChain]` | `chain` | Source chain of the transfer (default: probed across supported chains) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load bridges
load std

print @bridges:status(0x1111111111111111111111111111111111111111111111111111111111111111)
```

Poll until a CCTP transfer is ready to claim, then finalize it on the destination chain:

```evml
load bridges
load std

set $transferId 0x1111111111111111111111111111111111111111111111111111111111111111
loop until @bool(@bridges:status($transferId) == "claimable") (
  wait 30s
)
switch base
bridges:claim $transferId
```

## See Also

- [bridges:bridge](../commands/bridge.md)
- [bridges:claim](../commands/claim.md)
