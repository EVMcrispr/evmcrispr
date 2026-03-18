---
title: "@str"
---

Convert a value to its string representation.

**Returns**: `string`

## Syntax

```evml
@str(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `any` | Input value |

## Examples

```evml
# Convert a number to string
set $s @str(42)

# Convert an address to string
set $s @str(@me)

# Convert a boolean to string
set $s @str(true)
```

<!-- HAND-WRITTEN -->

## See Also

- [@num](num.md) — convert to number
- [@bytes](bytes.md) — convert to bytes
- [@bool](bool.md) — convert to boolean
