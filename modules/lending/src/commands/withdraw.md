---
title: "lending:withdraw"
---

Withdraw a supplied token from a lending market. Pass `max` as the amount to withdraw the full balance, accrued interest included.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
lending:withdraw <amount> <token>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `command \| number` | Runtime in smart blocks | Amount to withdraw in base units (wei), or the keyword `max` for the full balance |
| `token` | `address` | Build time | Supplied token to withdraw (use @token(SYM)) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--using` | `lending-adapter` | Build time | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |
| `--to` | `address` | Runtime in smart blocks | Recipient of the withdrawn tokens (defaults to the connected account) |

## Examples

```evml
# Withdraw 50 WXDAI from Aave v3 on Gnosis
lending:withdraw 50e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d

# Withdraw the full WXDAI balance, accrued interest included
lending:withdraw max 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d
```

<!-- HAND-WRITTEN -->

## See Also
