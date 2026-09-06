---
title: "@calc"
---

Evaluate checked 256-bit integer arithmetic; use // for truncating division.

**On-chain (`@calc!`)**: The same checked arithmetic evaluated on-chain.

**Returns**: `number`

## Syntax

```evml
@calc(...tokens)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...tokens]` | `any` | Integer arithmetic expression |

<!-- HAND-WRITTEN -->

## Arithmetic rules

Checked integer operators are `+ - * // % ^` and `xor`. `/` is rejected.
Every intermediate must fit its uint256 or int256 category. `//` truncates toward
zero; `%` has the dividend's sign. `^` is exponentiation, not XOR.
Use the `xor` keyword for 256-bit bitwise XOR; signed results use two's complement.
XOR has lower precedence than arithmetic. Fractional and scale-tagged operands
require explicit conversion to integer units first.

Unsigned arithmetic is the default. Negative values and signed ABI values select
signed arithmetic; mixing requires unsigned operands to fit int256. Positive
signed results keep their category. Exponents must be nonnegative.

## On-chain face (@calc!)

The same integer operations, overflow boundaries, and rounding rules execute
on-chain against live values. Constants obey the same checks. No arbitrary-precision
or rational intermediate is introduced implicitly.

See `num`, `floor`, and `ceil` for exact off-chain expressions rounded once at the end.
