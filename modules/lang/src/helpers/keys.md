---
title: "@lang:keys"
---

Entry names of a record (`[a:1 b:2]` or `[name value]` pairs), as an array.

**On-chain (`@lang:keys!`)**: The record is the word-pair payload `@zip!` and `@enumerate!` produce, and string names travel as their keccak digests.

**Returns**: `array`

## Syntax

```evml
@lang:keys(record)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `record` | `record` | Record (entries array) to read the names from |

<!-- HAND-WRITTEN -->

## On-chain face (@keys!)

Lane 0 of an on-chain record, selected through `unzipWords`.

THE ON-CHAIN RECORD REPRESENTATION: a record is a zipped key/value
word-pair payload — the interleaved words `k0 v0 k1 v1 …` that
`zipWords` and `@enumerate!` produce. String keys travel as their
keccak digests (keccak256 of the key's UTF-8 bytes): a build-time
literal key hashes at composition time, a live key hashes on-chain
through `hash`, and both land on the same word, so key equality is
digest equality. Values are plain words.

The result is the key lane's words payload, composable with the array
faces (`@len!`, `@includes!`, `@sort!`, …).

### Examples

```evml
load assertions
load lang

set $amm 0x44fA8E6f47987339850636F88629646662444217

# Every pair key (lane 0) is nonzero
def @pos! "$x: number -> bool" @bool!($x > 0)
assertions:assert @all!(@keys!($amm::{reservePairs()(uint256[])}) @pos!)
```

### Notes

- The record argument is a nested @zip!/@enumerate! face or a `::`
  call returning the interleaved pairs as single-word elements.
- An odd word count leaves the extra word in lane 0 (unzipWords
  semantics).

### See Also

- `assertions:assert`, `@values!`, `@lookup!`, `@enumerate!`, `@unzip!`
