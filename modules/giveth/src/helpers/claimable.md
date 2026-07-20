---
title: "@giveth:claimable"
---

GIV an account can claim from the GIVstream right now (see giveth:claim). Counts a pending giveth:claim earlier in the script as already claimed.

**Returns**: `number`

## Syntax

```evml
@giveth:claimable(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print the GIV your GIVstream has already released
print "Claimable GIV:" @giveth:claimable()
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:claim](../commands/claim.md)
