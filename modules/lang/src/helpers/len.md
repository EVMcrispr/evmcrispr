---
title: "@len"
---

Return the length of an array.

**Returns**: `number`

## Syntax

```evml
@len(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Input value |

## Examples

```evml
# Get array length
set $arr [10 20 30]
print @len($arr)
```

<!-- HAND-WRITTEN -->

## See Also

- [@at](at.md) — access element by index
- [@slice](slice.md) — extract a sub-array
- [@str.len](str.len.md) — string length
