---
title: "@assertions:min!"
---

Minimum of two or more values, computed on-chain at assertion time.

**Returns**: `number`

## Syntax

```evml
@assertions:min!(...values)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...values]` | `number` | Two or more numeric operands (or one array of them) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $vault 0x0102030405060708090a0b0c0d0e0f1011121314

# Variadic: folds left into nested calcUint(Min) calls
assertions:assert @min!($vault::{a()(uint256)} $vault::{b()(uint256)} 100) <= 100
```

## See Also

- [@assertions:max!](max.md), [@assertions:absdiff!](absdiff.md)
