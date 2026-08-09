---
title: "@math:max"
---

Maximum of two or more values: plain @max computes off-chain, @max! on-chain at execution time.

**Returns**: `number`

## Syntax

```evml
@math:max(...values)
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

assertions:assert @max!($vault::{a()(uint256)} $vault::{b()(uint256)}) > 0
```

## See Also

- [@math:min!](min.md), [@math:absdiff!](absdiff.md)
