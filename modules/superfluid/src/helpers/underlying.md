---
title: "@superfluid:underlying"
---

Underlying ERC-20 of a SuperToken (the zero address for native-asset SuperTokens like ETHx or xDAIx). As @underlying! the getUnderlyingToken() read happens on-chain at assertion time (the SuperToken still resolves at composition time).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

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

## On-chain face (@underlying!)

Read getUnderlyingToken() at assertion time. The SuperToken still
resolves at composition time — a symbol, an address, or a nested
composition-time face like `@token!`.

#
