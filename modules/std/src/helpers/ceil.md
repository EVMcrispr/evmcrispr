---
title: "@ceil"
---

Evaluate exact rational arithmetic, round the final result toward positive infinity, and check its 256-bit integer range.

**Returns**: `number`

## Syntax

```evml
@ceil(...tokens)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...tokens]` | `any` | Arithmetic expression (e.g. `$a + $b * 2`) |

<!-- HAND-WRITTEN -->

## Exact expression evaluation

Evaluate an arbitrary-precision rational expression, then round its final result
toward positive infinity. Positive results must fit uint256 and negative results int256.
Intermediate values are unbounded. Nested helpers introduce separate rounding boundaries.
This helper has no on-chain face; use `calcFloor!` or `calcCeil!` for supported
checked integer quotient expressions.
