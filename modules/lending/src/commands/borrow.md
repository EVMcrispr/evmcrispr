---
title: "lending:borrow"
---

Borrow a token from a lending market against the connected account's collateral (variable rate). The borrowed tokens go to the connected account.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
lending:borrow <amount> <token>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `number` | Runtime in smart blocks | Amount to borrow, in base units (wei) |
| `token` | `address` | Build time | Token to borrow (use @token(SYM)) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--using` | `lending-adapter` | Build time | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |
| `--on-behalf-of` | `address` | Runtime in smart blocks | Account whose debt grows (requires prior credit delegation; defaults to the connected account) |

## Examples

```evml
# Borrow 50 WXDAI at variable rate on Aave v3 (Gnosis)
lending:borrow 50e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d
```

<!-- HAND-WRITTEN -->

## See Also
