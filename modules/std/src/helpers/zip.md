---
title: "@zip"
---

Combine two arrays element-wise into an array of pairs.

**Returns**: `array`

## Syntax

```evml
@zip(a, b)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `a` | `array` |  |
| `b` | `array` | Second array |

## Examples

```evml
# Zip two arrays
set $keys [1 2 3]
set $vals ["a" "b" "c"]
set $pairs @zip($keys $vals)
```

<!-- HAND-WRITTEN -->

## See Also

- [@unzip](unzip.md) — split pairs into two arrays
- [@enumerate](enumerate.md) — pair elements with indices
