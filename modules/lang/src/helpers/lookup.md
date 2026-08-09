---
title: "@lang:lookup"
---

Look up an entry by name in a record (`[a:1 b:2]` or `[name value]` pairs). As @lookup! the value at wordIndexOf(keys, key) of an on-chain record — a zipped key/value word-pair payload (what @zip!/@enumerate! produce) — with build-time string keys keccak-hashed at composition time and live keys hashed on-chain; a missing key REVERTS the assertion (the index sentinel lands past the values lane).

**Returns**: `any`

## Syntax

```evml
@lang:lookup(record name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `record` | `record` | Record (entries array) to look the name up in (in @lookup! a zipped word-pair payload: a nested @zip!/@enumerate! face or a `::` call returning the interleaved pairs) |
| `name` | `string` | Entry name to look up (in @lookup! a build-time word or string — string keys travel as their keccak digests — or a live call/face) |

<!-- HAND-WRITTEN -->

## On-chain face (@lookup!)

The value at `wordIndexOf(keys, key)` of an on-chain record: the
record — a zipped key/value word-pair payload, see [@keys](keys.md)
for the representation — splits into its key and value lanes through
`unzipWords`, `wordIndexOf` finds the key's pair index, and a
word-index read of the value lane selects the value.

Keys follow the record representation: a build-time literal STRING key
is keccak-hashed at composition time, a live string/bytes key hashes
on-chain through `hash` (the digest path), and word keys (numbers,
addresses, bytes32) travel as themselves.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# The cap at index 2 of the enumeration
assertions:assert @lookup!(@enumerate!($vault::{caps()(uint256[])}) 2) >= 100
```

### Notes

- A MISSING KEY REVERTS the assertion: wordIndexOf's not-found
  sentinel is the lane's word count, which pushes the value read out
  of bounds. The off-chain @lookup raises its "no entry named" error
  at run time instead.
- The value is an untyped word (compared as a number/word).

### See Also

- `assertions:assert`, `@keys!`, `@values!`, `@enumerate!`, `@zip!`
