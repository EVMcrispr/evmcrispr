---
title: "@num"
---

Evaluate an arithmetic expression or convert a value to a number.

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
