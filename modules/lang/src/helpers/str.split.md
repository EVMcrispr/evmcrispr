---
title: "@str.split"
---

Split a string by a delimiter into an array of strings.

**Returns**: `array`

## Syntax

```evml
@str.split(s delim)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `s` | `string` | Source string |
| `delim` | `string` | Delimiter string |

## Examples

```evml
# Split by comma
set $parts @str.split("a,b,c" ",")

# Split by space
set $words @str.split("hello world" " ")
```

<!-- HAND-WRITTEN -->

## See Also

- [@str.join](str.join.md) — join array into a string
