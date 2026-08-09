---
title: "@math:sqrt"
---

Integer square root (floor): plain @sqrt computes off-chain, @sqrt! on-chain, the AMM invariant form, e.g. @sqrt!($pool::reserve0() * $pool::reserve1()).

**Returns**: `number`

## Syntax

```evml
@math:sqrt(...expression)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...expression]` | `number` | Unsigned numeric expression to take the square root of |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions
load math

set $pool 0x0102030405060708090a0b0c0d0e0f1011121314

# The AMM invariant, computed on-chain at execution time
assertions:assert @sqrt!($pool::{reserve0()(uint256)} * $pool::{reserve1()(uint256)}) >= 1e18

# Plain face: floor integer square root off-chain
set $side @sqrt(1e18)
```

## See Also

- [@math:min!](min.md), [@math:max!](max.md), [@math:absdiff!](absdiff.md)
