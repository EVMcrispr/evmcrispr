---
title: "@bytes.slice"
---

Extract a byte range from a bytes value.

**Returns**: `bytes`

## Syntax

```evml
@bytes.slice(value start end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Input value |
| `start` | `number` | Start index (inclusive) |
| `[end]` | `number` | End index (exclusive) |

## Examples

```evml
# Slice bytes
set $mid @bytes.slice(0xaabbccdd 1 3)
```

<!-- HAND-WRITTEN -->

## See Also

- [@bytes.at](bytes.at.md) — access a single byte
- [@slice](slice.md) — array slice
