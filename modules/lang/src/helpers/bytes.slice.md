---
title: "@lang:bytes.slice"
---

Extract a byte range from a bytes value.

**Returns**: `bytes`

## Syntax

```evml
@lang:bytes.slice(value start end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Input value |
| `start` | `number` | Start index (inclusive) |
| `[end]` | `number` | End index (exclusive) |

<!-- HAND-WRITTEN -->

## See Also

- [@bytes.at](bytes.at.md) — access a single byte
- [@slice](slice.md) — array slice
