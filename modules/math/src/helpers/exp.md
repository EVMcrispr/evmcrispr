---
title: "@math:exp"
---

e raised to a wad-scaled power, in wad (1e18) fixed point. Continuous growth over a period: a rate r compounded continuously multiplies a balance by exp(r).

**On-chain (`@math:exp!`)**: The result carries its wad scale, so surrounding arithmetic aligns to it; the plain face hands back the raw wad integer.

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

`e^x` in wad fixed point, as one `expWad` read.

The result is signed (`Int`) and carries a scale of 18, so it is a wad
whichever way the input was written: `@exp!(0)` is `1e18`, not `1`. Because
the scale travels with the operand, arithmetic around it lines up on its own
and a later `^` over the result becomes fixed-point exponentiation rather
than integer exponentiation.

### Notes

- A constant argument folds at composition time; nothing is read on-chain.
