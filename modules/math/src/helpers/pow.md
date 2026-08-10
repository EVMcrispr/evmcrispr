---
title: "@math:pow"
---

Raise a fixed-point value to a whole power, where one unit is `base` (1e18 by default, 1e27 for a ray). Compounding a per-period rate over N periods is pow(unit + rate, N).

**Returns**: `number`

## Syntax

```evml
@math:pow(value exponent base?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `number` | The fixed-point value to raise |
| `exponent` | `number` | Whole exponent |
| `[base]` | `number` | One unit of the value, e.g. 1e18 or 1e27 (default: 1e18) |

<!-- HAND-WRITTEN -->

## Usage

```evml
# 5% a year, compounded per second over a year, in ray
set $rate @math:pow(1000000001585489599188229325 31536000 1e27)
```

## Relationship to `^`

`^` is integer exponentiation. On a fixed-point value it is not merely
imprecise, it is a different function: `1.05e18 ^ 3` multiplies the unit
in three times over and lands at 1.157e54, and the word overflows after
about four steps. `@pow` divides the unit back out after each multiply,
so `@math:pow(105e16 3)` is 1.157625e18.

When a value already carries its decimal places — because the helper
that produced it says so — `^` picks the fixed-point form on its own,
and `@num!($rate ^ 3)` is the natural spelling. Reach for `@pow` when
the unit is not tracked: a ray integer read straight from a contract has
no decimal places attached to it, and the third argument is how you say
which unit it is in.

## See Also
