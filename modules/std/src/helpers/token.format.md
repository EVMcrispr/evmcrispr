---
title: "@token.format"
---

Format a base-unit token amount as a human-readable string with the token symbol.

**Returns**: `string`

## Syntax

```evml
@token.format(tokenSymbolOrAddress amount)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbolOrAddress` | `token-symbol` | Token symbol (e.g. `DAI`) or address |
| `amount` | `number` | Amount in base units |

## Examples

```evml
# Format a base-unit amount as a human-readable string
print @token.format(DAI 500000000000000000)

# Print a holder's balance in human-readable form
print @token.format(DAI @token.balance(DAI @token(DAI)))
```

<!-- HAND-WRITTEN -->

## See Also

- [@token](token.md) — resolve token address
- [@token.balance](token.balance.md) — query token balance
- [@token.amount](token.amount.md) — convert human-readable amount to base units
