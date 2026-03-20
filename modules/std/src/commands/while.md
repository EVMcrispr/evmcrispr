---
title: "while"
---

Repeat a block while a condition is true.

## Syntax

```evml
while <condition> <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `condition` | `expression` | Expression; loop continues while truthy |
| `block` | `block` | Commands to repeat |

## Examples

```evml
# Countdown loop
set $i 3
while @bool($i > 0) (
  print $i
  set $i @num($i - 1)
)
```

<!-- HAND-WRITTEN -->

## See Also

- [for](for.md) — iterate over an array
- [@bool](../helpers/bool.md) — boolean expressions
