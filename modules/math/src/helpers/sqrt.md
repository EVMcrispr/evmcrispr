---
title: "@math:sqrt"
---

Integer square root (floor).

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

# Plain face: floor integer square root off-chain (plain helpers need the
# module prefix; only the `!` faces resolve unqualified)
set $side @math:sqrt(1e18)
```

## See Also

- [@math:min!](min.md), [@math:max!](max.md), [@math:absdiff!](absdiff.md)

## On-chain face (@math:sqrt!)

Integer square root as one `sqrt` read: `floor(sqrt(x))`, so `@sqrt!(8)` is
`2`.

The argument is a full expression rather than a single operand, so
`@sqrt!($a::x() * $b::y())` compiles the product first and takes the root of
the result — which is how a geometric mean is written without a temporary.

### Notes

- Unsigned only; a negative constant or an `Int` operand is rejected.
- Not fixed point: taking the root of a wad gives a wad-of-half-scale, so
  scale it yourself if you need one back.
