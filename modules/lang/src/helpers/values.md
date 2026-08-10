---
title: "@lang:values"
---

Entry values of a record (`[a:1 b:2]` or `[name value]` pairs), as an array.

**On-chain (`@lang:values!`)**: The record is the word-pair payload `@zip!` and `@enumerate!` produce, and string names travel as their keccak digests.

**Returns**: `array`

## Syntax

```evml
@lang:values(record)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `record` | `record` | Record (entries array) to read the values from |

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
load lang

set $amm 0x44fA8E6f47987339850636F88629646662444217

# The pair values (lane 1) sum past the floor
assert @reduce!(@values!($amm::{reservePairs()(uint256[])}) add 0) >= 100
```

### Notes

- The record argument is a nested @zip!/@enumerate! face or a `::`
  call returning the interleaved pairs as single-word elements.

### See Also

- `assert`, `@keys!`, `@lookup!`, `@enumerate!`, `@unzip!`
