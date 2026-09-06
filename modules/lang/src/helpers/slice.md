---
title: "@lang:slice"
---

Extract a section of an array.

**On-chain (`@lang:slice!`)**: Supports typed arrays and live signed indices. Bounds clamp to the array length and end is exclusive, matching the off-chain helper.

**Returns**: `array`

## Syntax

```evml
@lang:slice(value start end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Source array |
| `start` | `number` | Start index (inclusive; negative counts from the end) |
| `[end]` | `number` | End index (exclusive; negative counts from the end; omitted = to the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@at](at.md) — access a single element
- [@len](len.md) — array length

## On-chain face (@slice!)

Slice a typed array using signed indexes, an inclusive start and exclusive end. Negative indexes count from the end; bounds clamp to the array length and reversed ranges yield an empty array. Source and indexes remain live until execution. Multiword elements retain their type.
