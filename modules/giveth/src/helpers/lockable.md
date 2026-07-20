---
title: "@giveth:lockable"
---

Staked GIV an account can lock (or unstake) right now: staked GIV minus everything the GIVpower contract counts as locked, including ended locks that were never unlocked (see @giveth:unlockable). Counts pending stake/lock actions earlier in the script — what `lock max` resolves to.

**Returns**: `number`

## Syntax

```evml
@giveth:lockable(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print the staked GIV you could lock right now
print "Lockable GIV:" @giveth:lockable()
```

<!-- HAND-WRITTEN -->

## Lockable vs unstakable

Both [giveth:lock](../commands/lock.md) and
[giveth:unstake](../commands/unstake.md) are gated by the same contract
check — staked balance minus `totalAmountLocked` — which is what this
helper returns. [@giveth:unstakable](unstakable.md) differs by following
the round clock instead: it already counts locks whose round ended but
that still need a [giveth:unlock](../commands/unlock.md)
([@giveth:unlockable](unlockable.md) shows that portion).

## See Also

- [giveth:lock](../commands/lock.md)
- [@giveth:unlockable](unlockable.md)
- [@giveth:unstakable](unstakable.md)
- [@giveth:staked](staked.md)
