---
title: "lending:set-collateral"
---

Enable or disable a supplied token as collateral for the connected account's borrows.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
lending:set-collateral <token> <mode>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `address` | Runtime in smart blocks | Supplied token to toggle (use @token(SYM)) |
| `mode` | `command` | Build time | `on` to use the token as collateral, `off` to stop |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--using` | `lending-adapter` | Build time | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Stop using GNO as collateral on Aave v3 (Gnosis)
lending:set-collateral 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb off
```

<!-- HAND-WRITTEN -->

## See Also
