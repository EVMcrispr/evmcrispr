---
title: "lending:withdraw"
---

Withdraw a supplied token from a lending market. Pass `max` as the amount to withdraw the full balance, accrued interest included.

## Syntax

```evml
lending:withdraw <amount> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `command \| number` | Amount to withdraw in base units (wei), or the keyword `max` for the full balance |
| `token` | `address` | Supplied token to withdraw (use @token(SYM)) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--using` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |
| `--to` | `address` | Recipient of the withdrawn tokens (defaults to the connected account) |

## Examples

```evml
# Withdraw 50 WXDAI from Aave v3 on Gnosis
lending:withdraw 50e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d

# Withdraw the full WXDAI balance, accrued interest included
lending:withdraw max 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d
```

<!-- HAND-WRITTEN -->

## See Also
