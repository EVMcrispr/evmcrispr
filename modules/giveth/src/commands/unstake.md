---
title: "giveth:unstake"
---

Unstake GIV from GIVpower: unwrap gGIV on Gnosis, withdraw from the staking contract on Optimism and Polygon zkEVM. Pass `max` as the amount to unstake everything the contract allows right now — staked GIV minus locks, where locks whose round already ended still count until giveth:unlock frees them (see @giveth:unlockable). A zero amount does nothing.

## Syntax

```evml
giveth:unstake <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `command \| number` | Amount of GIV to unstake in base units (wei), or the keyword `max` for everything not locked |

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
