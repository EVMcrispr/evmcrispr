---
title: "@math:max"
---

Maximum of two or more values.

**On-chain (`@math:max!`)**: Operands are written out at the call site, or given as one literal array; an array a call returns has no on-chain form here.

**Returns**: `number`

## Syntax

```evml
@math:max(...values)
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

assertions:assert @max!($vault::{a()(uint256)} $vault::{b()(uint256)}) > 0
```

## See Also

- [@math:min!](min.md), [@math:absdiff!](absdiff.md)

## On-chain face (@math:max!)

Folds the operands pairwise through `max`, so N operands cost N-1 reads.

The operands are collected at composition time — written out, or given as one
literal array. An array a CALL returns has no form here, unlike `@sum!`, which
folds a words payload. If you need the maximum of a live array, sort it and
take the last element: `@at!(@sort!($v::caps()) -1)`.

### Notes

- Signedness follows the operands: an `Int` among them picks the signed
  overload, so negative values order correctly.
