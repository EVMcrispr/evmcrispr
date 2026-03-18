---
title: "@num.format"
---

Format a number with decimal places (like formatUnits).

**Returns**: `string`

## Syntax

```evml
@num.format(value, decimals)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `number` | Input value |
| `decimals` | `number` | Number of decimal places |

## Examples

```evml
# Format wei to ETH (18 decimals)
set $eth @num.format(1500000000000000000 18)

# Format USDC (6 decimals)
set $usd @num.format(1500000 6)
```

<!-- HAND-WRITTEN -->

## See Also

- [@num.parse](num.parse.md) — inverse: parse a decimal string
- [@token.amount](token.amount.md) — token-aware unit conversion
