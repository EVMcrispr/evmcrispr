---
title: "@token:amount"
---

Convert a human-readable token amount to its base unit (applying decimals).

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
