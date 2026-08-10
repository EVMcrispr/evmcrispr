---
title: "@giveth:unstakable"
---

GIV an account can unstake at the current chain time: staked GIV minus the locks whose GIVpower round hasn't finished yet. Locks whose round has ended count as unstakable (unlocking is permissionless) but still need a giveth:unlock before giveth:unstake accepts them. Time-aware inside sim:fork: after a wait, ended locks drop out of the locked amount. Counts pending stake/unstake/lock actions earlier in the script.

**Returns**: `number`

## Syntax

```evml
@giveth:unstakable(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print how much GIV you could unstake right now
print "Unstakable GIV:" @giveth:unstakable()
```

<!-- HAND-WRITTEN -->

## Reading the future from a fork

The GIVpower contract doesn't expose per-round lock amounts through any
view, so the helper reads them straight from contract storage and compares
each lock's end round against `currentRound()`. Because `currentRound()`
follows the block timestamp, warping time on a fork moves the answer:

```evml
load sim
sim:fork (
  wait 2419200
  print "Unstakable in 4 weeks:" @giveth:unstakable()
)
```

Locks that ended but were never unlocked count as unstakable because
anyone can unlock them; to actually withdraw, run
[giveth:unlock](../commands/unlock.md) for the finished round before
[giveth:unstake](../commands/unstake.md).

## See Also

- [@giveth:staked](staked.md)
- [giveth:lock](../commands/lock.md)
- [giveth:unlock](../commands/unlock.md)
- [giveth:unstake](../commands/unstake.md)
