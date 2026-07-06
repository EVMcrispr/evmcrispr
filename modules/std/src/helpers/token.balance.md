---
title: "@token.balance"
---

Fetch the token balance of an address in base units.

**Returns**: `number`

## Syntax

```evml
@token.balance(tokenSymbol holder)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbol` | `token-symbol` | Token symbol (e.g. `DAI`) or address |
| `holder` | `address` | Address to query |

## Examples

```evml
# Query a token balance
set $bal @token.balance(DAI @token(DAI))
```

<!-- HAND-WRITTEN -->

## See Also

- [@token](token.md) — resolve token address
- [@token.amount](token.amount.md) — convert to base units
- [@token.format](token.format.md) — format base units as a human-readable string
- [@get](get.md) — generic contract reads
