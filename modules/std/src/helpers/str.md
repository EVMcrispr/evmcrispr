---
title: "@str"
---

Convert a value to its string representation, or decode hex bytes as UTF-8.

**Returns**: `string`

## Syntax

```evml
@str(value, encoding?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `any` | Input value |
| `[encoding]` | `string` | `utf8` to decode hex bytes as a UTF-8 string |

## Examples

```evml
# Convert a number to string
set $s @str(42)

# Convert an address to string
set $s @str(@me)

# Decode hex bytes as UTF-8
set $s @str(0x48656c6c6f utf8)
print $s
```

<!-- HAND-WRITTEN -->

## See Also

- [@num](num.md) — convert to number
- [@bytes](bytes.md) — convert to bytes
- [@bool](bool.md) — convert to boolean
