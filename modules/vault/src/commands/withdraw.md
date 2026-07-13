---
title: "vault:withdraw"
---

Withdraw an exact amount of the underlying asset from an ERC-4626 vault, burning the required shares. Pass `max` as the amount to withdraw everything available.

## Syntax

```evml
vault:withdraw <assets> <from> <vault>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `assets` | `command \| number` | Amount of the underlying asset to withdraw in base units (wei), or the keyword `max` for everything available |
| `from` | `command` | Keyword `from` |
| `vault` | `address` | ERC-4626 vault address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--to` | `address` | Receiver of the withdrawn assets (defaults to the connected account) |

## Examples

```evml
# Withdraw 50 WXDAI worth of the sDAI position on Gnosis
vault:withdraw 50e18 from 0xaf204776c7245bF4147c2612BF6e5972Ee483701
```

<!-- HAND-WRITTEN -->

## See Also
