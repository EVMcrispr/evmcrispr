---
title: "@lang:num.parse"
---

Parse a decimal string with a given number of decimals (like parseUnits).

**Returns**: `number`

## Syntax

```evml
@lang:num.parse(value decimals)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string \| number` | Input value |
| `decimals` | `number` | Number of decimal places |

<!-- HAND-WRITTEN -->

## See Also

- [@num.format](num.format.md) — inverse: format an integer with decimals
- [@token.amount](../../../std/src/helpers/token.amount.md) — token-aware unit conversion
