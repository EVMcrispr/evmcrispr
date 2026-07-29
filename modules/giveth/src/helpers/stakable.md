---
title: "@giveth:stakable"
---

GIV in an account's wallet that giveth:stake can stake for GIVpower. Counts pending claim/stake/unstake actions earlier in the script — what `stake max` resolves to.

**Returns**: `number`

## Syntax

```evml
@giveth:stakable(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print the GIV you could stake right now
print "Stakable GIV:" @giveth:stakable()
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:stake](../commands/stake.md)
- [@giveth:staked](staked.md)
- [@giveth:lockable](lockable.md)
- [@giveth:claimable](claimable.md)
