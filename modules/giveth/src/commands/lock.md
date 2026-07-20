---
title: "giveth:lock"
---

Lock staked GIV for a number of GIVpower rounds (2 weeks each) to multiply its GIVpower. Locked GIV cannot be unstaked until the last round ends and it is unlocked.

## Syntax

```evml
giveth:lock <amount> <rounds>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount of staked GIV to lock, in base units (wei) |
| `rounds` | `number` | Number of rounds to lock for (each round lasts 2 weeks) |

## Examples

```evml
# Lock 100 staked GIV for 26 rounds (a year) to multiply its GIVpower
giveth:lock 100e18 26
```

<!-- HAND-WRITTEN -->

## Power multiplier

Locking multiplies GIVpower: `amount * sqrt(rounds + 1)` instead of a 1x
weight. Each round lasts two weeks; the lock releases at the end of its last
round, after which [giveth:unlock](unlock.md) makes the tokens unstakeable
again.

## See Also

- [giveth:unlock](unlock.md)
- [@giveth:round](../helpers/round.md)
- [@giveth:givpower](../helpers/givpower.md)
