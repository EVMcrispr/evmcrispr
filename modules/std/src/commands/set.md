---
title: "set"
---

Assign a value to a variable for use later in the script.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
set <variable> <value>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable name |
| `value` | `any` | Runtime in smart blocks | Value to assign |

## Examples

```evml
# Set a simple value
set $amount 1e18

# Set a string
set $greeting "hello world"

# Set from a helper result
set $dai @token(DAI)

# Destructuring assignment
set [$a $b] ["hello" "world"]

# Skip values with _
set [_ $second] ["skip" "keep"]

# Nested destructuring
set [$a [_ $b]] ["x" ["skip" "y"]]
```

<!-- HAND-WRITTEN -->

## See Also

- [@get](../helpers/get.md) — read contract state into a variable
- [def](def.md) — define reusable commands/helpers
