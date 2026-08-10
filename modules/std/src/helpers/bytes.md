---
title: "@bytes"
---

Convert a value to hex bytes, force UTF-8 encoding, or perform a bitwise operation.

**On-chain (`@bytes!`)**: Bitwise operations run over the raw 32-byte words (shifts in bits, `>>` arithmetic on a signed value); with one argument it is the raw word cast.

**Returns**: `bytes`

## Syntax

```evml
@bytes(a b? c?)
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

- [@bytes.not](../../../lang/src/helpers/bytes.not.md) — bitwise NOT
- [@bytes.concat](../../../lang/src/helpers/bytes.concat.md) — concatenate bytes
- [@bytes.slice](../../../lang/src/helpers/bytes.slice.md) — extract a byte range

## On-chain face (@bytes!)

Bitwise word operations computed on-chain (`&` `|` `^` `<<` `>>`), or with a single argument the raw 32-byte word cast (e.g. bool as 0/1). Word-width semantics: operands are the raw 32-byte words; shifts are in bits, and `>>` on a signed value is the arithmetic shift (the sign fills in from the left).

#
