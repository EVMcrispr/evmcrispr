---
title: "@calcFloor"
---

Evaluate checked 256-bit integer arithmetic; root division rounds floor.

**On-chain (`@calcFloor!`)**: The same checked arithmetic evaluated on-chain.

**Returns**: `number`

## Syntax

```evml
@calcFloor(...tokens)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...tokens]` | `any` | Integer arithmetic expression |

<!-- HAND-WRITTEN -->

## Arithmetic rules

Use `@calcFloor(a / b)` or `@calcFloor(a * b / c)` for floor rounding.
The multiplication in the second form uses a full 512-bit intermediate. Other
arithmetic inside operands remains checked at each step. `//` and other quotient
shapes are rejected; nested helpers establish explicit evaluation boundaries.
An integer expression without division is also accepted.

Unsigned arithmetic is the default. Negative values and signed ABI values select
signed arithmetic; mixing requires unsigned operands to fit int256. Positive
signed results keep their category. Exponents must be nonnegative.

## On-chain face (@calcFloor!)

The same integer operations, overflow boundaries, and rounding rules execute
on-chain against live values. Constants obey the same checks. No arbitrary-precision
or rational intermediate is introduced implicitly.

See `num`, `floor`, and `ceil` for exact off-chain expressions rounded once at the end.
