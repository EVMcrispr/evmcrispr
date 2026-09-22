---
title: "superfluid:auto-wrap"
---

Keep a SuperToken balance topped up automatically: when the balance falls below --lower of outflow runway, Superfluid's keepers wrap enough underlying to reach --upper. WARNING: by default this grants the wrap strategy an unlimited allowance on the underlying token (matching Superfluid's own UI, since the schedule is open-ended) — cap it with --allowance.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:auto-wrap <token>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--lower` | `number` | Runtime in smart blocks | Runway threshold that triggers a wrap, in time units (default 7d; protocol minimum 2d) |
| `--upper` | `number` | Runtime in smart blocks | Runway to top up to when triggered, in time units (default 14d; protocol minimum 7d) |
| `--expiry` | `number` | Runtime in smart blocks | Unix timestamp when the schedule expires (default: never) |
| `--allowance` | `number` | Runtime in smart blocks | Cap the underlying allowance granted to the wrap strategy (default: unlimited) |
| `--no-approve` | `bool` | Build time | Skip the automatic allowance action |

## Examples

```evml
# Keep your USDCx topped up from USDC automatically (wrap when below 7 days of runway, up to 14 days)
superfluid:auto-wrap USDCx

# Cap the strategy's allowance instead of granting unlimited
superfluid:auto-wrap USDCx --allowance 5000e6 --lower 3d --upper 8d
```

<!-- HAND-WRITTEN -->

## See Also
