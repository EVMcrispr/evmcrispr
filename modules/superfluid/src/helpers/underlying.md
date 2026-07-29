---
title: "@superfluid:underlying"
---

Underlying ERC-20 of a SuperToken (the zero address for native-asset SuperTokens like ETHx or xDAIx).

**Returns**: `address`

## Syntax

```evml
@superfluid:underlying(token)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol or address |

## Examples

```evml
# Print the underlying token of USDCx
print "Underlying:" @superfluid:underlying(USDCx)
```

<!-- HAND-WRITTEN -->

## See Also
