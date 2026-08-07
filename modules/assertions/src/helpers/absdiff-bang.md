---
title: "@assertions:absdiff!"
---

Absolute difference |a - b| computed on-chain — never underflows; `@absdiff!(a b) <= d` is the composable approximate-equality.

**Returns**: `number`

## Syntax

```evml
@assertions:absdiff!(a b)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `a` | `number` | First numeric operand |
| `b` | `number` | Second numeric operand |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $oracle 0x0102030405060708090a0b0c0d0e0f1011121314

# Composable approximate equality between two live values
assertions:assert @absdiff!($oracle::{price()(uint256)} $oracle::{twap()(uint256)}) <= 50e8 "price diverged"
```

## See Also

- [@assertions:min!](min-bang.md), [@assertions:max!](max-bang.md)
