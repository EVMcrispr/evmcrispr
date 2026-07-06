---
title: "@str.join"
---

Join array elements into a string with a delimiter.

**Returns**: `string`

## Syntax

```evml
@str.join(arr delim)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `delim` | `string` | Delimiter string |

## Examples

```evml
# Join array with comma
set $parts ["a" "b" "c"]
set $csv @str.join($parts ",")

# Join with space
set $parts ["a" "b" "c"]
set $spaced @str.join($parts " ")
```

<!-- HAND-WRITTEN -->

## See Also

- [@str.split](str.split.md) — split a string into an array
- [@str.concat](str.concat.md) — concatenate strings
