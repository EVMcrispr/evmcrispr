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
| `value` | `bytes` | Source bytes or string value |
| `start` | `number` | Start index (inclusive; negative counts from the end) |
| `[end]` | `number` | End index (exclusive; negative counts from the end; omitted = to the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@bytes.at](bytes.at.md) — access a single byte
- [@slice](slice.md) — array slice

## On-chain face (@bytes.slice!)

Both modes use an inclusive start and exclusive end, measured in bytes. Negative indexes count from the end. Bounds clamp to the byte length; reversed ranges return empty bytes. Runtime source and indexes are resolved at execution time. Arbitrary byte ranges are preserved without UTF-8 decoding.
