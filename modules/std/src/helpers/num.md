---
title: "@num"
---

Evaluate exact rational arithmetic, truncate the final result toward zero, and check its 256-bit integer range.

**Returns**: `number`

## Syntax

```evml
@num(...tokens)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...tokens]` | `any` | Arithmetic expression (e.g. `$a + $b * 2`) |

## Examples

```evml
# Basic arithmetic
set $sum @num(1 + 2)

# Exponentiation
set $pow @num(2 ^ 10)

# Expression with variables
set $a 10
set $b 3
set $result @num($a * $b + 1)

# Convert a string to number
set $n @num("42")
```

<!-- HAND-WRITTEN -->

## See Also

- [@num.format](../../../lang/src/helpers/num.format.md) — format with decimals (like `formatUnits`)
- [@num.parse](../../../lang/src/helpers/num.parse.md) — parse a decimal string (like `parseUnits`)
- [@bool](bool.md) — boolean expressions

## Exact evaluation and final conversion

`num` computes exact rational intermediates, then truncates the final result toward zero.
The final nonnegative integer must fit uint256; negative integers must fit int256.
Use `floor` or `ceil` to choose another final rounding direction.
Use `calc` and `calc!` for checked integer arithmetic, with `//` for division.

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

These rules apply when the base, exponent, and modulus evaluate to integers.
`num` still permits arbitrary-precision operands and checks only the final
integer's range. Without a following modulus, `3 ^ -1` remains the exact
rational `1/3` before final truncation; for example, `@num(3 ^ -1 * 3)` is `1`.
`floor` and `ceil` share these expression rules.
