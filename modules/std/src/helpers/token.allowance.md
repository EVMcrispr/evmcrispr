---
title: "@token.allowance"
---

Fetch the allowance an owner has granted to a spender, in base units.

**Returns**: `number`

## Syntax

```evml
@token.allowance(tokenSymbol owner spender)
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
set $allowance @token.allowance(DAI @me 0x4F2083f5fBede34C2714aFfb3105539775f7FE64)

# Top up an allowance only when it is too low
set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
if @bool(@token.allowance(DAI @me $spender) < @token.amount(DAI 100)) (
  exec @token(DAI) "approve(address,uint256)" $spender @token.amount(DAI 100)
)
```

<!-- HAND-WRITTEN -->

## See Also

- [@token.balance](token.balance.md) — token balance of an address
- [@token.amount](token.amount.md) — convert to base units
