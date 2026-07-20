---
title: "giveth:unlock"
---

Unlock GIV locks that ended at the given GIVpower round, making the tokens unstakeable again. Anyone can unlock for any account once the round is over; the round must be earlier than the current one (see @giveth:round).

## Syntax

```evml
giveth:unlock <round> [...account]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `round` | `number` | The round the locks ended at (must be earlier than the current round) |
| `[...account]` | `address` | Accounts to unlock (defaults to the connected account) |

## Examples

```evml
# Unlock your GIV locks that ended at the previous round
giveth:unlock @num(@giveth:round - 1)
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:lock](lock.md)
- [giveth:unstake](unstake.md)
- [@giveth:round](../helpers/round.md)
