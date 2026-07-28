---
title: "@token"
---

Resolve a token symbol to its contract address on the current chain.

**Returns**: `address`

## Syntax

```evml
@token(tokenSymbolOrAddress)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbolOrAddress` | `token-symbol` | Token symbol (e.g. `DAI`) or address |

## Examples

```evml
# Resolve a token symbol
set $dai @token(DAI)

# Resolve the native token
set $native @token(XDAI)
```

<!-- HAND-WRITTEN -->

## See Also

- [@token:amount](../../../token/src/helpers/amount.md) — convert human amounts to base units
- [@token:balance](../../../token/src/helpers/balance.md) — query token balance
