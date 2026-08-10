---
title: "@math:min"
---

Minimum of two or more values.

**On-chain (`@math:min!`)**: Operands are written out at the call site, or given as one literal array; an array a call returns has no on-chain form here.

**Returns**: `number`

## Syntax

```evml
@math:min(...values)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...values]` | `any` | Two or more numeric operands (or one array of them) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions
load math

set $vault 0x0102030405060708090a0b0c0d0e0f1011121314
set $budget 500e18

# Variadic: folds left into nested calcUint(Min) calls
assertions:assert @min!($vault::{a()(uint256)} $vault::{b()(uint256)} 100) <= 100

# Plain face: computed off-chain at script build time (plain helpers need the
# module prefix; only the `!` faces resolve unqualified)
set $floor @math:min(100e18 $budget)
```

## See Also

- [@math:max!](max.md), [@math:absdiff!](absdiff.md)

## On-chain face (@math:min!)

Folds the operands pairwise through `min`, so N operands cost N-1 reads.

The operands are collected at composition time — written out, or given as one
literal array. An array a CALL returns has no form here, unlike `@sum!`, which
folds a words payload. If you need the minimum of a live array, sort it and
take the first element: `@at!(@sort!($v::caps()) 0)`.

### Notes

- Signedness follows the operands: an `Int` among them picks the signed
  overload, so negative values order correctly.
