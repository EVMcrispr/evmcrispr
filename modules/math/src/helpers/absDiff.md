---
title: "@math:absDiff"
---

Absolute difference |a - b|.

**On-chain (`@math:absDiff!`)**: Never underflows, so `@absDiff!(a b) <= d` is the composable approximate-equality.

**Returns**: `number`

## Syntax

```evml
@math:absDiff(a b)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `a` | `number` | First numeric operand |
| `b` | `number` | Second numeric operand |

<!-- HAND-WRITTEN -->

## Examples

```evml
load math

set $oracle 0x0102030405060708090a0b0c0d0e0f1011121314

# Composable approximate equality between two live values
assert @absDiff!($oracle::{price()(uint256)} $oracle::{twap()(uint256)}) <= 50e8 "price diverged"
```

## See Also

- [@math:min!](min.md), [@math:max!](max.md)

## On-chain face (@math:absDiff!)

`|a - b|` as one `absDiff` read, over exactly two operands.

The point of having it at all is that it never underflows. Written as a
comparison it would need a branch (`a > b ? a - b : b - a`); as a single
operand it composes, so `@absDiff!(a b) <= d` is the approximate-equality an
assertion can express directly.

### Notes

- Exactly two operands. Unlike `@min!`/`@max!` there is no list form.
