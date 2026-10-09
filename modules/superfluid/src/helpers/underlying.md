---
title: "@superfluid:underlying"
---

Underlying ERC-20 of a SuperToken (the zero address for native-asset SuperTokens like ETHx or xDAIx).

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

Read getUnderlyingToken() at assertion time. A SuperToken given as a symbol, an
address, or a nested `@token(...)` resolves at composition time and folds into
the expression as a build-time constant; it may also be a `::!` call returning
the SuperToken's address, read when the assertion runs. This is the live half of that
pairing: the token list says which SuperToken to look at, and this says what it
currently wraps.

#
