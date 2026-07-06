---
title: "@str.includes"
---

Check whether a string contains a substring.

**Returns**: `bool`

## Syntax

```evml
@str.includes(value item)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Input value |
| `item` | `string` | Substring to search for |

## Examples

```evml
# Check if string contains substring
print @str.includes("hello world" "world")

# Check for missing substring
print @str.includes("hello world" "xyz")
```

<!-- HAND-WRITTEN -->

## See Also

- [@str.replace](str.replace.md) — find and replace
- [@includes](includes.md) — array membership check
