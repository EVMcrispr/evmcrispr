---
title: "@math:exp"
---

e raised to a wad-scaled power, in wad (1e18) fixed point. Continuous growth over a period: a rate r compounded continuously multiplies a balance by exp(r).

**On-chain (`@math:exp!`)**: Accepts only values known before execution and carries the result’s wad scale for surrounding arithmetic.

**Returns**: `number`

## Syntax

```evml
@math:exp(exponent)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `exponent` | `number` | Wad-scaled exponent, e.g. 0.05e18 |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also

## On-chain face (@math:exp!)

Only values known before execution are supported. The result is calculated
ahead of time and carries a signed wad scale of 18. Live operands are rejected.
