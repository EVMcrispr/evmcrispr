---
title: "@token.symbol"
---

Return the symbol of a token.

**Returns**: `string`

## Syntax

```evml
@token.symbol(tokenSymbol)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbol` | `token-symbol` | Token address (or symbol) |

## Examples

```evml
# Read the symbol of a token by address
set $symbol @token.symbol(0x44fA8E6f47987339850636F88629646662444217)

# The native token symbol
print @token.symbol(0x0000000000000000000000000000000000000000)
```

<!-- HAND-WRITTEN -->

## See Also

- [@token](token.md) — resolve a symbol to its address (the inverse lookup)
- [@token.decimals](token.decimals.md)
