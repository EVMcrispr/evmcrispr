---
title: "@lang:zip"
---

Combine two arrays element-wise into an array of pairs.

**On-chain (`@lang:zip!`)**: Either or both sides may be live, and a length mismatch reverts.

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

Interleave two word payloads on-chain through `zipWords`. Either side,
or both, may be live (a call or nested face) or a constant array
literal. When both are live the second offset is computed on-chain from
the first payload's length. A word-count mismatch reverts with
WordCountMismatch.

### Examples

```evml
load assertions
load lang

set $amm 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @zip!($amm::{caps()(uint256[])} [7 8]) == 0x1122
```

### See Also

- `assertions:assert`, `@unzip!`
