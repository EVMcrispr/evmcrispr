---
title: "@token:symbol"
---

Symbol a token reports, looked up by address.

**On-chain (`@token:symbol!`)**: The native token has no contract, so it folds to its constant symbol instead of an on-chain read.

**Returns**: `string`

## Syntax

```evml
@token:symbol(tokenSymbol)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbol` | `token-symbol` | Token address, or a symbol resolved through the token list |

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

The argument is the *token*, not the answer: passing an address is the
useful direction, since the symbol is what comes back. A symbol goes
through the token list and resolves to that list's address, so
`@token:symbol!(DAI)` checks that whatever the list calls DAI still
reports `DAI` on-chain.

### Usage

```evml
load token

set $token 0x44fA8E6f47987339850636F88629646662444217

# The token at this address still reports the expected symbol
assert @token:symbol!($token) == "DAI" "unexpected token"

# Composes with the lang string faces
load lang
assert @str.lower!(@token:symbol!($token)) == "dai"
```

## See Also

- [@token](../../../std/src/helpers/token.md) — resolve a symbol to its address (the inverse lookup)
- [@token:decimals](decimals.md)
