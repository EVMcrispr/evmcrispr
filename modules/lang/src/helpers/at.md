---
title: "@at"
---

Access an element by index in an array.

**Returns**: `any`

## Syntax

```evml
@at(value, index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Input value |
| `index` | `number` | Zero-based index (negative counts from end) |

## Examples

```evml
# Access first element
set $arr [10 20 30]
set $first @at($arr 0)

# Access last element (negative index)
set $arr [10 20 30]
set $last @at($arr -1)
```

<!-- HAND-WRITTEN -->

## See Also

- [@slice](slice.md) — extract a sub-array
