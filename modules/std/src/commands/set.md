# set

Assign a value to a variable for use later in the script.

## Syntax

```
set <variable> <value>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| variable | `variable` | Yes |
| value | `any` | Yes |

<!-- HAND-WRITTEN -->









## Examples

```
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

## See Also

- [@get](../helpers/get.md) — read contract state into a variable
- [def](def.md) — define reusable commands/helpers
