---
title: "superfluid:connect-pool"
---

Connect the sender to a GDA pool so pool earnings count toward the real-time balance automatically. Disconnected members still accrue but must claim explicitly.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:connect-pool <pool>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `pool` | `address` | Runtime in smart blocks | GDA pool address |

## Examples

```evml
# Connect to a pool you were added to, so earnings stream straight into your balance
superfluid:create-pool $rewards xDAIx
superfluid:connect-pool $rewards
```

<!-- HAND-WRITTEN -->

## See Also
