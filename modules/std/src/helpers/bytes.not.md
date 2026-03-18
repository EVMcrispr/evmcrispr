---
title: "@bytes.not"
---

Bitwise NOT of a bytes value (256-bit complement).

**Returns**: `bytes`

## Syntax

```evml
@bytes.not(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Input value |

## Examples

```evml
# Bitwise NOT
set $b @bytes.not(0x00ff)
```

<!-- HAND-WRITTEN -->

## See Also

- [@bytes](bytes.md) — bitwise AND, OR, shift
