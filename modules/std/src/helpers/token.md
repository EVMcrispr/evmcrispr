# @token

Resolve a token symbol to its contract address on the current chain.

**Returns**: `address`

## Syntax

```
@token(tokenSymbolOrAddress)
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| tokenSymbolOrAddress | `token-symbol` | Yes |

<!-- HAND-WRITTEN -->









## Examples

```
# Resolve a token symbol
set $dai @token(DAI)

# Also works with the native token symbol
set $native @token(XDAI)

# Pass-through: accepts an address too
set $addr @token(0x6B17...1d0F)
```

## See Also

- [@token.amount](../token.amount.md) — convert human amounts to base units
- [@token.balance](../token.balance.md) — query token balance
