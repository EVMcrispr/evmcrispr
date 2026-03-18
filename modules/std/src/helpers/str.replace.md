---
title: "@str.replace"
---

Replace all occurrences of a substring.

**Returns**: `string`

## Syntax

```evml
@str.replace(s, old, replacement)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `s` | `string` | Source string |
| `old` | `string` | Substring to match |
| `replacement` | `string` | Replacement text |

## Examples

```evml
# Replace all occurrences
set $s @str.replace("foo-bar-baz" "-" "_")

# Remove a substring
set $s @str.replace("hello world" " world" "")
```

<!-- HAND-WRITTEN -->

## See Also

- [@str.includes](str.includes.md) — check for substring
- [@str.split](str.split.md) — split by delimiter
