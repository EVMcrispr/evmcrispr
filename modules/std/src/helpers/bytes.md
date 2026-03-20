---
title: "@bytes"
---

Convert a value to hex bytes, force UTF-8 encoding, or perform a bitwise operation.

**Returns**: `bytes`

## Syntax

```evml
@bytes(a, b?, c?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `a` | `any` | Value to convert or left operand |
| `[b]` | `string` | Operator (`&` `|` `<<` `>>`) or `utf8` |
| `[c]` | `any` | Right operand for bitwise ops |

## Examples

```evml
# Convert a number to bytes
set $b @bytes(0xff)

# Bitwise AND
set $b @bytes(0xff00 "&" 0x0ff0)

# Left shift
set $b @bytes(0x01 "<<" 8)
```

<!-- HAND-WRITTEN -->

## See Also

- [@bytes.not](bytes.not.md) — bitwise NOT
- [@bytes.concat](bytes.concat.md) — concatenate bytes
- [@bytes.slice](bytes.slice.md) — extract a byte range
