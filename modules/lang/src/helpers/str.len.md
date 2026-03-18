---
title: "@str.len"
---

Return the length of a string.

**Returns**: `number`

## Syntax

```evml
@str.len(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Input value |

## Examples

```evml
# Get string length
set $s "hello"
print @str.len($s)

# Empty string length
print @str.len("")
```

<!-- HAND-WRITTEN -->

## See Also

- [@str.slice](str.slice.md) — extract a substring
- [@len](len.md) — array length
