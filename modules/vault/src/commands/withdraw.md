---
title: "vault:withdraw"
---

Withdraw an exact amount of the underlying asset from an ERC-4626 vault, burning the required shares. Pass `max` as the amount to withdraw everything available. For ERC-7540 asynchronous vaults use vault:request-redeem instead.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
vault:withdraw <assets> <from> <vault>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `assets` | `command \| number` | Runtime in smart blocks | Amount of the underlying asset to withdraw in base units (wei), or the keyword `max` for everything available |
| `from` | `command` | Build time | Keyword `from` |
| `vault` | `address` | Build time | ERC-4626 vault address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--to` | `address` | Runtime in smart blocks | Receiver of the withdrawn assets (defaults to the connected account) |

## Examples

```evml
# Withdraw 50 WXDAI worth of the sDAI position on Gnosis
vault:withdraw 50e18 from 0xaf204776c7245bF4147c2612BF6e5972Ee483701
```

<!-- HAND-WRITTEN -->

## See Also
