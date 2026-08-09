---
title: "@token:amount"
---

Convert a human-readable token amount to its base unit (applying decimals). As @amount! the scaling composes on-chain against a live decimals() read: mul(mantissa, exp(10, decimals - fractionDigits)).

**Returns**: `number`

## Syntax

```evml
@token:amount(tokenSymbolOrAddress amount)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbolOrAddress` | `token-symbol` | Token symbol (e.g. `DAI`) or address |
| `amount` | `number` | Human-readable amount |

## Examples

```evml
# Convert 100 DAI to base units
set $amount @token:amount(DAI 100)
```

<!-- HAND-WRITTEN -->

## See Also

- [@token](../../../std/src/helpers/token.md) — resolve a token symbol to its address
- `@balance` — query token balance
- [@token:format](format.md) — format base units as a human-readable string
- [@num.parse](../../../lang/src/helpers/num.parse.md) — generic decimal parsing

## On-chain face (@amount!)

Scale a human-readable amount into base units against the LIVE
decimals() read: `mul(mantissa, exp(10, decimals - k))` where the
amount is `mantissa / 10^k`. The native token's decimals are a chain
constant, so a native @amount! folds at build time.

#
