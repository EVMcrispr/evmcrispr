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

`(a + b) % m` and `(a * b) % m` use a full-width sum or product,
so that intermediate may exceed uint256 or int256. Signed remainders follow
the sum or product's sign, regardless of the modulus's sign. Mixed operands
must all fit int256. A zero modulus still fails.
Only the operation immediately before `%` is fused: earlier operations and
nested helper results remain checked. Use parentheses around a sum because `%`
binds more tightly than `+`.

Unsigned arithmetic is the default. Negative values and signed ABI values select
signed arithmetic; mixing requires unsigned operands to fit int256. Positive
signed results keep their category. Ordinary powers require nonnegative exponents; modular powers also accept negative exponents.

## On-chain face (@calcFloor!)

The same integer operations, overflow boundaries, and rounding rules execute
on-chain against live values. Constants obey the same checks.

See `num`, `floor`, and `ceil` for exact off-chain expressions rounded once at the end.

## Modular powers and inverses

`a ^ e % m` (or `(a ^ e) % m`) computes an integer modular power without
materializing the intermediate power. A negative exponent uses the modular
inverse: `3 ^ -1 % 11` is `4`, and `3 ^ -2 % 11` is `5`.
The inverse exists only when the base and modulus are coprime; otherwise the
expression fails. Composite moduli are supported. Modulus zero fails, modulus
`1` or `-1` returns zero, and exponent zero returns `1 % m`, including `0 ^ 0`.

For a negative base, odd exponents (including negative odd exponents) return a
negative remainder: `-3 ^ -1 % 11` is `-4`. The modulus's sign is ignored.
This uses signed remainders, not a normalized nonnegative residue convention.

Only a power immediately followed by `%` receives modular semantics; an
intervening operation or nested helper establishes a separate evaluation boundary.

The exponent's signedness does not change the base/modulus category. Thus a
negative exponent can be used with full-width uint256 values. A signed base or
modulus requires both of those operands to fit int256; the exponent keeps its
own uint256 or int256 range. These rules also apply to the on-chain face.
