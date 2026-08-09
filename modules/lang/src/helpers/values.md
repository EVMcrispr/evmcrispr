---
title: "@lang:values"
---

Return the entry values of a record (`[a:1 b:2]` or `[name value]` pairs) as an array. As @values! lane 1 of an on-chain record — a zipped key/value word-pair payload (what @zip!/@enumerate! produce; string keys travel as their keccak digests) — selected through unzipWords.

**Returns**: `array`

## Syntax

```evml
@lang:values(record)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `record` | `record` | Record (entries array) to read the values from (in @values! a zipped word-pair payload: a nested @zip!/@enumerate! face or a `::` call returning the interleaved pairs) |

<!-- HAND-WRITTEN -->

## On-chain face (@values!)

Lane 1 of an on-chain record, selected through `unzipWords`. A record
is a zipped key/value word-pair payload — the interleaved words
`k0 v0 k1 v1 …` that `zipWords` and `@enumerate!` produce; string keys
travel as their keccak digests (see [@keys](keys.md) for the full
representation).

The result is the value lane's words payload, composable with the
array faces (`@reduce!`, `@sort!`, `@len!`, …).

### Examples

```evml
load assertions
load lang

set $amm 0x44fA8E6f47987339850636F88629646662444217

# The pair values (lane 1) sum past the floor
assertions:assert @reduce!(@values!($amm::{reservePairs()(uint256[])}) add 0) >= 100
```

### Notes

- The record argument is a nested @zip!/@enumerate! face or a `::`
  call returning the interleaved pairs as single-word elements.

### See Also

- `assertions:assert`, `@keys!`, `@lookup!`, `@enumerate!`, `@unzip!`
