---
title: "@lang:bytes.at"
---

Access a single byte by index in a bytes value.

**Returns**: `bytes`

## Syntax

```evml
@lang:bytes.at(value index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Source bytes value |
| `index` | `number` | Zero-based byte index (negative counts from the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@bytes.slice](bytes.slice.md) — extract a byte range
- [@at](at.md) — array element access

## On-chain face (@bytes.at!)

Select one byte using a signed index; negative indexes count from the end. Out-of-bounds or fractional indexes are rejected. Runtime source and index remain live until execution.
