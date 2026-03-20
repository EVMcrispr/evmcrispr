---
title: "if"
---

Conditionally execute a block of commands, with an optional else block.

## Syntax

```evml
if <condition> <thenBlock> [elseBlock]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `condition` | `bool` | Whether to execute the then block |
| `thenBlock` | `block` | Commands when condition is true |
| `[elseBlock]` | `block` | Commands when condition is false |

## Examples

```evml
# Simple condition
if true (
  print "yes"
)

# Boolean expression
if @bool(1 == 1) (
  print "equal"
)

# If-else
set $x 10
if @bool($x > 0) (
  print "positive"
) (
  print "non-positive"
)
```

<!-- HAND-WRITTEN -->

## See Also

- [@bool](../helpers/bool.md) — boolean expressions
