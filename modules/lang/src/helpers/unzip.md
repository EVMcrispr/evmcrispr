---
title: "@unzip"
---

Transpose an array of pairs into two separate arrays.

**Returns**: `array`

## Syntax

```evml
@unzip(pairs)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pairs` | `array` | Array of [a, b] pairs |

## Examples

```evml
# Unzip pairs into arrays
set $pairs [[1 "a"] [2 "b"] [3 "c"]]
set [$keys $vals] @unzip($pairs)
```

<!-- HAND-WRITTEN -->

## See Also

- [@zip](zip.md) — combine two arrays into pairs
