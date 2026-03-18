---
title: "@num.parse"
---

Parse a decimal string with a given number of decimals (like parseUnits).

**Returns**: `number`

## Syntax

```evml
@num.parse(value, decimals)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `any` | Input value |
| `decimals` | `number` | Number of decimal places |

## Examples

```evml
# Parse ETH to wei (18 decimals)
set $wei @num.parse("1.5" 18)

# Parse USDC (6 decimals)
set $raw @num.parse("1.5" 6)
```

<!-- HAND-WRITTEN -->

## See Also

- [@num.format](num.format.md) — inverse: format an integer with decimals
- [@token.amount](token.amount.md) — token-aware unit conversion
