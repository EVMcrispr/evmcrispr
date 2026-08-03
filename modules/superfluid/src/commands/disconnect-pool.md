---
title: "superfluid:disconnect-pool"
---

Disconnect the sender from a GDA pool. Earnings keep accruing but no longer count toward the real-time balance until claimed or reconnected.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
superfluid:disconnect-pool <pool>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | GDA pool address |

## Examples

```evml
# Disconnect from a pool (earnings keep accruing, claim later)
superfluid:create-pool $rewards xDAIx
superfluid:connect-pool $rewards
superfluid:disconnect-pool $rewards
```

<!-- HAND-WRITTEN -->

## See Also
