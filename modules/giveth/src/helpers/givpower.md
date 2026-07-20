---
title: "@giveth:givpower"
---

GIVpower balance of an account: staked GIV plus the extra power gained from locking.

**Returns**: `number`

## Syntax

```evml
@giveth:givpower(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print your GIVpower balance
print "GIVpower:" @giveth:givpower()
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:stake](../commands/stake.md)
- [giveth:lock](../commands/lock.md)
