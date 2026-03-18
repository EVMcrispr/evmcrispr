---
title: "@str.slice"
---

Extract a section of a string.

**Returns**: `string`

## Syntax

```evml
@str.slice(value, start, end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Input value |
| `start` | `number` | Start index (inclusive) |
| `[end]` | `number` | End index (exclusive) |

## Examples

```evml
# Slice a prefix
set $s "hello world"
set $hello @str.slice($s 0 5)

# Slice from offset to end
set $s "hello world"
set $world @str.slice($s 6)

# Negative index slice
set $s "hello world"
set $last3 @str.slice($s -3)
```

<!-- HAND-WRITTEN -->

## See Also

- [@str.at](str.at.md) — access a single character
- [@slice](slice.md) — array slice
