---
title: "print"
---

Log values to the console output. Arrays render as headerless tables: a flat array as one row, an array of arrays as one row per inner array.

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
| `--headers` | `array` | Column headers; renders the printed arrays as a table, one array per column |

## Examples

```evml
# Print a string
print "hello"

# Print multiple values
print "count:" 42

# Print variables
set $name "world"
print "hello" $name

# Print an array as a one-row table
print [1 2 3]

# Print an array of arrays as table rows
print [[alice 10] [bob 20]]

# Print column arrays as a table
print [[alice bob] [10 20]] --headers [Name Score]
```

<!-- HAND-WRITTEN -->

## See Also
