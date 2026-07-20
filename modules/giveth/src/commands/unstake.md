---
title: "giveth:unstake"
---

Unstake GIV from GIVpower: unwrap gGIV on Gnosis, withdraw from the staking contract on Optimism and Polygon zkEVM. Pass `max` as the amount to unstake the full staked balance. Locked GIV cannot be unstaked until it is unlocked.

## Syntax

```evml
giveth:unstake <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `command \| number` | Amount of GIV to unstake in base units (wei), or the keyword `max` for the full staked balance |

## Examples

```evml
# Unstake 100 GIV from GIVpower
giveth:unstake 100e18

# Unstake everything that is not locked
giveth:unstake max
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:stake](stake.md)
- [giveth:unlock](unlock.md)
