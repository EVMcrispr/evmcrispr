---
title: "superfluid:disconnect-pool"
---

Disconnect the sender from a GDA pool. Earnings keep accruing but no longer count toward the real-time balance until claimed or reconnected.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:disconnect-pool <pool>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `pool` | `address` | Runtime in smart blocks | GDA pool address |

## Examples

```evml
# Disconnect from a pool (earnings keep accruing, claim later)
superfluid:create-pool $rewards xDAIx
superfluid:connect-pool $rewards
superfluid:disconnect-pool $rewards
```

<!-- HAND-WRITTEN -->

## See Also
