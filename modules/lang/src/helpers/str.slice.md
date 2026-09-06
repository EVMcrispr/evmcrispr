---
title: "@lang:str.slice"
---

Extract a UTF-8 byte range, with clamped indexes and complete characters.

**On-chain (`@lang:str.slice!`)**: Slices UTF-8 bytes; ranges cutting through a character are rejected.

**Returns**: `string`

## Syntax

```evml
@lang:str.slice(value start end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Source string or bytes value |
| `start` | `number` | Start index (inclusive; negative counts from the end) |
| `[end]` | `number` | End index (exclusive; negative counts from the end; omitted = to the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@str.at](str.at.md) — access a single character
- [@slice](slice.md) — array slice

## On-chain face (@str.slice!)

Both modes use UTF-8 byte offsets, an inclusive start and an exclusive end. Negative indexes count from the end; bounds clamp to the byte length, and reversed ranges produce an empty string. Nonempty ranges must contain complete UTF-8 characters. Runtime source and indexes are resolved at execution time. Use `@bytes.slice` for arbitrary byte ranges.
