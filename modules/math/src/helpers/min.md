---
title: "@math:min"
---

Minimum of two or more values.

**Returns**: `number`

## Syntax

```evml
@math:min(...values)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...values]` | `number` | Two or more numeric operands (or one array of them) |

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
