---
title: "@lang:num.parse"
---

Parse ordinary decimal notation into base units with explicit rounding and signedness.

**On-chain (`@lang:num.parse!`)**: Parse live decimal strings; precision must be 0–77. Rounding and signedness are constant options.

**Returns**: `number`

## Syntax

```evml
@lang:num.parse(value decimals rounding? signedness?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string \| number` | Input decimal string |
| `decimals` | `number` | Decimal precision (0–77) |
| `[rounding]` | `string` | trunc (default), floor, or ceil |
| `[signedness]` | `string` | signed (default) or unsigned |

<!-- HAND-WRITTEN -->

## See Also

- [@num.format](num.format.md) — inverse: format an integer with decimals
- [@token:amount](../../../token/src/helpers/amount.md) — token-aware unit conversion

## On-chain face

The on-chain face uses Operations decimal conversions. Precision is 0–77.
Parsing accepts ordinary decimal notation, including `.5`, `1.`, and a leading
plus sign; it rejects spaces, exponents and separators. Optional rounding is
`trunc` (default), `floor`, or `ceil`; optional signedness is `signed` (default)
or `unsigned`. Unsigned parsing rejects a minus sign, including `-0`.
Formatting emits ordinary decimal notation and removes trailing fractional zeros.
Integer range and rounding behavior match off-chain evaluation.
