---
title: "@lang:bytes.not"
---

Bitwise NOT of a bytes value (256-bit complement).

**Returns**: `bytes`

## Syntax

```evml
@lang:bytes.not(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Input value |

<!-- HAND-WRITTEN -->

## See Also

- [@bytes](../../../std/src/helpers/bytes.md) — bitwise AND, OR, shift

## On-chain face (@bytes.not!)

Complements a single 32-byte word. There is no NOT in the operator set and none
is needed: complementing is `xor` against the all-ones word, so this is one
`bitXor` read (or a constant fold when the input is known).

A dynamic `bytes` or `string` value is rejected — it has no fixed width to
complement, and complementing "the word" of something whose length is only
known on-chain would silently mean something else.

### Notes

- Result is `Bytes32`, not the input's width.
