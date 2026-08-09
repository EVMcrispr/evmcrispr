---
title: "@lang:zip"
---

Combine two arrays element-wise into an array of pairs. As @zip! the two word payloads interleave on-chain through zipWords — at most one side live, and a word-count mismatch reverts at assertion time.

**Returns**: `array`

## Syntax

```evml
@lang:zip(a b)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `a` | `array` | First array to zip (in @zip! a `::` call, nested array face, or constant array literal) |
| `b` | `array` | Second array |

<!-- HAND-WRITTEN -->

## See Also

- [@unzip](unzip.md) — split pairs into two arrays
- [@enumerate](enumerate.md) — pair elements with indices

## On-chain face (@zip!)

Interleave two word payloads on-chain through `zipWords`. At most one
side is live (a call or nested face); the other is a constant array
literal. A word-count mismatch reverts with WordCountMismatch at
assertion time.

### Examples

```evml
load assertions
load lang

set $amm 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @zip!($amm::{caps()(uint256[])} [7 8]) == 0x1122
```

### See Also

- `assertions:assert`, `@unzip!`
