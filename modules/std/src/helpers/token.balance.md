---
title: "@token.balance"
---

Fetch the token balance of an address in base units.

**Returns**: `number`

## Syntax

```evml
@token.balance(tokenSymbol, holder)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbol` | `token-symbol` |  |
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
- [@get](get.md) — generic contract reads
