---
title: "@concat"
---

Concatenate arrays together.

**Returns**: `array`

## Syntax

```evml
@concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `array` | First array to concatenate |
| `[...rest]` | `array` | Additional arrays to append |

## Examples

```evml
# Concatenate two arrays
set $a [1 2]
set $b [3 4]
set $merged @concat($a $b)

# Concatenate three arrays
set $triple @concat([1 2] [3 4] [5 6])
```

<!-- HAND-WRITTEN -->

## See Also

- [@flat](flat.md) — flatten nested arrays
