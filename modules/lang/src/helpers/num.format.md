---
title: "@lang:num.format"
---

Format an integer in base units as ordinary decimal notation, trimming trailing fractional zeros.

**On-chain (`@lang:num.format!`)**: Format live signed or unsigned integers with 0–77 decimal places.

**Returns**: `string`

## Syntax

```evml
@lang:num.format(value decimals)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `number` | Integer in base units |
| `decimals` | `number` | Decimal precision (0–77) |

<!-- HAND-WRITTEN -->

## See Also

- [@num.parse](num.parse.md) — inverse: parse a decimal string
- [@token:amount](../../../token/src/helpers/amount.md) — token-aware unit conversion

## On-chain face

The on-chain face uses Operations decimal conversions. Precision is 0–77.
Parsing accepts ordinary decimal notation, including `.5`, `1.`, and a leading
plus sign; it rejects spaces, exponents and separators. Optional rounding is
`trunc` (default), `floor`, or `ceil`; optional signedness is `signed` (default)
or `unsigned`. Unsigned parsing rejects a minus sign, including `-0`.
Formatting emits ordinary decimal notation and removes trailing fractional zeros.
Integer range and rounding behavior match off-chain evaluation.
