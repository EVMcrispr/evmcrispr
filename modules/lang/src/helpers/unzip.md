---
title: "@lang:unzip"
---

Transpose an array of pairs into two separate arrays. As @unzip! one LANE of the word payload is selected on-chain through unzipWords — the lane argument (0 or 1) is required there; an odd word count gives lane 0 the extra word.

**Returns**: `array`

## Syntax

```evml
@lang:unzip(pairs lane?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pairs` | `array` | Array of [a, b] pairs |
| `[lane]` | `number` | @unzip! only: which lane to keep — 0 (first of each pair) or 1 (second) |

<!-- HAND-WRITTEN -->

## See Also

- [@zip](zip.md) — combine two arrays into pairs

## On-chain face (@unzip!)

Select one LANE of an interleaved word payload on-chain through
`unzipWords`. The lane argument is required in the on-chain face: 0
keeps the first word of each pair, 1 the second; an odd word count
gives lane 0 the extra word.

### Examples

```evml
load assertions
load lang

set $amm 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @unzip!($amm::{reservePairs()(uint256[])} 0) == 0x1122
```

### See Also

- `assertions:assert`, `@zip!`
