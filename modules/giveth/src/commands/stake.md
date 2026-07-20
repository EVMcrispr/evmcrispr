---
title: "giveth:stake"
---

Stake GIV for GIVpower, approving the staking contract automatically when needed. On Gnosis GIV is wrapped into gGIV through the GIVgarden (which auto-stakes it); on Optimism and Polygon zkEVM it is staked directly. Staked GIV earns GIVstream rewards and can be locked for more GIVpower.

## Syntax

```evml
giveth:stake <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount of GIV to stake, in base units (wei) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Stake 100 GIV for GIVpower (auto-approves)
giveth:stake 100e18
```

<!-- HAND-WRITTEN -->

## GIVpower lifecycle

Staked GIV earns rewards (harvest them with [giveth:claim](claim.md)) and
counts as GIVpower you can use to boost projects on giveth.io. Lock it with
[giveth:lock](lock.md) to multiply its power. On Gnosis staking wraps GIV
into gGIV through the GIVgarden; on Optimism and Polygon zkEVM it deposits
into the UnipoolGIVpower contract.

## See Also

- [giveth:unstake](unstake.md)
- [giveth:lock](lock.md)
- [giveth:claim](claim.md)
- [@giveth:givpower](../helpers/givpower.md)
