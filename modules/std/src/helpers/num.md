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
