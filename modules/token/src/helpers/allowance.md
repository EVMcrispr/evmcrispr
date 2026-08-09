---
title: "@token:allowance"
---

Fetch the allowance an owner has granted to a spender, in base units. As @allowance! the symbol resolves at composition time and allowance(owner, spender) is read on-chain at assertion time — owner/spender may themselves be live calls.

**Returns**: `number`

## Syntax

```evml
@token:allowance(tokenSymbol owner spender)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbol` | `token-symbol` | Token symbol (e.g. `DAI`) or address |
| `owner` | `address` | Owner address |
| `spender` | `address` | Spender address |

## Examples

```evml
# Query an allowance
set $allowance @token:allowance(DAI @me 0x4F2083f5fBede34C2714aFfb3105539775f7FE64)

# Top up an allowance only when it is too low
set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
if @bool(@token:allowance(DAI @me $spender) < @token:amount(DAI 100)) (
  token:approve @token:amount(DAI 100) @token(DAI) for $spender
)
```

<!-- HAND-WRITTEN -->

## See Also

- `@balance` — token balance of an address
- [@token:amount](amount.md) — convert to base units
- [token:approve](../commands/approve.md) — grant an allowance

## On-chain face (@allowance!)

Read allowance(owner, spender) at assertion time. The symbol resolves
at composition time; owner and spender are literal addresses, or live
`::` calls folded into a core read splice.

#
