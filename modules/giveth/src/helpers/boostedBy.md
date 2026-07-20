---
title: "@giveth:boostedBy"
---

Projects an account boosts with its GIVpower, as a pair of same-length arrays [slugs percentages] sorted by percentage descending. Empty arrays when the account has no boosts.

**Returns**: `array`

## Syntax

```evml
@giveth:boostedBy(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print the projects you are boosting and their percentages
print @giveth:boostedBy(@me)
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:boost](../commands/boost.md)
- [@giveth:givpower](../helpers/givpower.md)
