---
title: "print"
---

Print values to script output (stdout in the CLI). Arrays render as headerless tables: a flat array as one row, an array of arrays as one row per inner array.

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

## Export output

The CLI sends printed text to stdout and status messages to stderr. Each
`print` adds a newline, preserving existing text and table formatting.

```sh
evmcrispr run export.evml > output.txt
```

Redirection is shell syntax, not EVML syntax. The terminal's **Download output**
exports the same printed text as `output.txt`. Print only a JSON package when
exporting a JSON file; additional prints would also be included.

Programmatic hosts can capture printed messages with `onOutput`. Messages do
not include the terminating newline; hosts append it when exporting. Without
`onOutput`, printed messages continue to use `onLog`.


## See Also
