---
title: "@superfluid:token"
---

Resolve a SuperToken from the Superfluid token list: by SuperToken symbol (USDCx), or by underlying token address (the USDC address returns USDCx).

**Returns**: `address`

## Syntax

```evml
@superfluid:token(symbolOrUnderlying)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `symbolOrUnderlying` | `supertoken` | SuperToken symbol, or the underlying token's address |

## Examples

```evml
# Resolve USDCx from the USDC address and print both
set $usdcx @superfluid:token(0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83)
print "USDCx:" $usdcx
```

<!-- HAND-WRITTEN -->

## See Also
