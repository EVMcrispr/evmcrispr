---
title: "@giveth:unlockable"
---

GIV in locks whose GIVpower round has ended but that giveth:unlock hasn't freed yet. Until unlocked, the GIVpower contract still counts it as locked, so it can be neither locked again nor unstaked. Time-aware inside sim:fork: after a wait, newly ended locks show up here.

**Returns**: `number`

## Syntax

```evml
@giveth:unlockable(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print the GIV a giveth:unlock would free
print "Unlockable GIV:" @giveth:unlockable()
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:unlock](../commands/unlock.md)
- [@giveth:round](round.md)
- [@giveth:lockable](lockable.md)
- [@giveth:unstakable](unstakable.md)
