---
title: "@token:symbol"
---

Return the symbol of a token. As @symbol! the token resolves at composition time and symbol() is read on-chain at assertion time as a String operand — digest-judged like the other string faces, and composable with them (e.g. `@str.lower!(@token:symbol!(DAI))`); the native token folds to its constant symbol.

**Returns**: `string`

## Syntax

```evml
@token:symbol(tokenSymbol)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbol` | `token-symbol` | Token address (or symbol) |

## Examples

```evml
# Read the symbol of a token by address
set $symbol @token:symbol(0x44fA8E6f47987339850636F88629646662444217)

# The native token symbol
print @token:symbol(0x0000000000000000000000000000000000000000)
```

<!-- HAND-WRITTEN -->

## On-chain face (@symbol!)

The token resolves at composition time and `symbol()` is read on-chain
at assertion time as a STRING operand: top-level and nested `==`/`!=`
judge it by the keccak digest of the decoded payload, like the other
string faces, and the string faces splice its envelope directly. The
native token folds to its constant symbol at build time.

### Usage

```evml
load assertions
load token

# Digest-judged equality
assertions:assert @token:symbol!(DAI) == "DAI" "symbol changed"

# Composes with the lang string faces
load lang
assertions:assert @str.lower!(@token:symbol!(DAI)) == "dai"
```

## See Also

- [@token](../../../std/src/helpers/token.md) — resolve a symbol to its address (the inverse lookup)
- [@token:decimals](decimals.md)
