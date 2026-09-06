---
title: "@lang:zip"
---

Combine two arrays element-wise into an array of pairs.

**On-chain (`@lang:zip!`)**: Either or both sides may be live, a length mismatch reverts, and the result retains the type of each lane.

**Returns**: `array`

## Syntax

```evml
@lang:zip(a b)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `a` | `array` | First array to zip |
| `b` | `array` | Second array to zip |

<!-- HAND-WRITTEN -->

## See Also

- [@unzip](unzip.md) — split pairs into two arrays
- [@enumerate](enumerate.md) — pair elements with indices

## On-chain face (@zip!)

Pair two equally sized arrays in order. Unequal lengths fail in both modes. Each lane retains its own type, including multiword types.
