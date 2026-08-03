---
title: "vault:redeem"
---

Redeem an exact amount of ERC-4626 vault shares for the underlying asset. Pass `max` as the amount to redeem the full share balance. For ERC-7540 asynchronous vaults use vault:request-redeem instead.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
vault:redeem <shares> <of> <vault>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `shares` | `command \| number` | Amount of vault shares to redeem in base units (wei), or the keyword `max` for the full balance |
| `of` | `command` | Keyword `of` |
| `vault` | `address` | ERC-4626 vault address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--to` | `address` | Receiver of the redeemed assets (defaults to the connected account) |

## Examples

```evml
# Redeem 50 sDAI shares for WXDAI on Gnosis
vault:redeem 50e18 of 0xaf204776c7245bF4147c2612BF6e5972Ee483701

# Exit a vault completely with `max`, previewed inside a fork simulation
load sim

sim:fork --using anvil (
  sim:set-balance @me 200e18
  exec 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d deposit() --value 100e18
  vault:deposit 100e18 into 0xaf204776c7245bF4147c2612BF6e5972Ee483701
  vault:redeem max of 0xaf204776c7245bF4147c2612BF6e5972Ee483701
)
```

<!-- HAND-WRITTEN -->

## See Also
