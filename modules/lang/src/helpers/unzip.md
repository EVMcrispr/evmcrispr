---
title: "@lang:unzip"
---

Transpose an array of pairs into two separate arrays.

**On-chain (`@lang:unzip!`)**: The `lane` argument defaults to 0 (`@keys!` is lane 0 and `@values!` lane 1), and an odd word count gives lane 0 the extra word.

**Returns**: `array`

## Syntax

```evml
@lang:unzip(pairs lane?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pairs` | `array` | Array of [a, b] pairs |
| `[lane]` | `number` | Which lane to keep: 0 (first of each pair) or 1 (second) |

<!-- HAND-WRITTEN -->

## See Also

- [@zip](zip.md) — combine two arrays into pairs
- [@keys](keys.md), the named form of lane 0 over a record
- [@values](values.md), the named form of lane 1 over a record

## On-chain face (@unzip!)

Select one LANE of an interleaved word payload on-chain through
`unzipWords`. Lane 0 keeps the first word of each pair, 1 the second;
an odd word count gives lane 0 the extra word.

`unzipWords` returns ONE lane per call, so the two lanes are always two
separate reads: there is no form that hands you both. The lane argument
is optional and defaults to 0, which means `@unzip!(x)` is exactly
`@unzip!(x 0)` and compiles to byte-identical calldata.

Because a bare `@unzip!(x)` does not say WHICH half you got, prefer the
named forms when the payload is a record: `@keys!` is lane 0 and
`@values!` is lane 1, both compiling to the same read as the
corresponding `@unzip!` lane.

### Examples

```evml
load lang

set $amm 0x44fA8E6f47987339850636F88629646662444217

assert @unzip!($amm::{reservePairs()(uint256[])} 0) == 0x1122

# the lane may be omitted, and then it is lane 0
assert @unzip!($amm::{reservePairs()(uint256[])}) == 0x1122
```

### See Also

- `assert`, `@zip!`
