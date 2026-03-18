---
title: "@str.at"
---

Access a character by index in a string.

**Returns**: `string`

## Syntax

```evml
@str.at(value, index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Input value |
| `index` | `number` | Zero-based character index |

## Examples

```evml
# Get the first character
set $s "hello"
set $c @str.at($s 0)

# Get the last character (negative index)
set $s "hello"
set $l @str.at($s -1)
```

<!-- HAND-WRITTEN -->

## See Also

- [@str.slice](str.slice.md) — extract a substring
- [@at](at.md) — array element access
