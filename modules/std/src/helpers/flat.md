---
title: "@flat"
---

Flatten one level of nesting in an array.

**Returns**: `array`

## Syntax

```evml
@flat(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |

## Examples

```evml
# Flatten nested arrays
set $nested [[1 2] [3 4] [5]]
set $result @flat($nested)
```

<!-- HAND-WRITTEN -->

## See Also

- [@concat](concat.md) — concatenate arrays
- [@map](map.md) — transform then flatten with `@flat(@map(...))`
