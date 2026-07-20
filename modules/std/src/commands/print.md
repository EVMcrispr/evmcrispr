---
title: "print"
---

Log values to the console output.

## Syntax

```evml
print [...values]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...values]` | `any` | Values to output, space-separated |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--table` | `array` | Column headers; renders the printed arrays as a table, one array per column |

## Examples

```evml
# Print a string
print "hello"

# Print multiple values
print "count:" 42

# Print variables
set $name "world"
print "hello" $name

# Print column arrays as a table
print [[alice bob] [10 20]] --table [Name Score]
```

<!-- HAND-WRITTEN -->

## See Also
