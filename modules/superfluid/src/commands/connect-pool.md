---
title: "superfluid:connect-pool"
---

Connect the sender to a GDA pool so pool earnings count toward the real-time balance automatically. Disconnected members still accrue but must claim explicitly.

## Syntax

```evml
superfluid:connect-pool <pool>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | GDA pool address |

## Examples

```evml
# Connect to a pool you were added to, so earnings stream straight into your balance
superfluid:create-pool $rewards xDAIx
superfluid:connect-pool $rewards
```

<!-- HAND-WRITTEN -->

## See Also

