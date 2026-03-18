---
title: "@str.concat"
---

Concatenate strings together.

**Returns**: `string`

## Syntax

```evml
@str.concat(first, ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `string` |  |
| `[...rest]` | `string` | Strings to append |

## Examples

```evml
# Concatenate strings
set $full @str.concat("hello" " " "world")

# Concatenate with helper result
set $greeting @str.concat("hi " @str(@me))
```

<!-- HAND-WRITTEN -->

## See Also

- [@str.join](str.join.md) — join array elements with a delimiter
- [@concat](concat.md) — concatenate arrays
