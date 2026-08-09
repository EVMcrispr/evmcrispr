---
title: "@token:decimals"
---

Return the number of decimals of a token. As @decimals! the symbol resolves at composition time and decimals() is read on-chain at assertion time (the native token folds to its constant).

**Returns**: `number`

## Syntax

```evml
@token:decimals(tokenSymbol)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbol` | `token-symbol` | Token symbol (e.g. `DAI`) or address |

## Examples

```evml
# Read the decimals of a token
set $decimals @token:decimals(DAI)

# Scale an amount manually
set $base @num(25 * 10 ^ @token:decimals(DAI))
```

<!-- HAND-WRITTEN -->

## See Also

- [@token:amount](amount.md) — convert to base units applying decimals
- [@token:format](format.md) — format base units as a human-readable string

## On-chain face (@decimals!)

Read decimals() at assertion time. The symbol resolves to the token
address at composition time (like the plain face); the native token
folds to its chain constant at build time.

#
