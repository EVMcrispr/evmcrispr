---
title: "@lang:lookup"
---

Look up an entry by name in a record (`[a:1 b:2]` or `[name value]` pairs).

**On-chain (`@lang:lookup!`)**: The record is a `@zip!`/`@enumerate!` word-pair payload, string names travel as keccak digests, and a missing name reverts.

**Returns**: `any`

## Syntax

```evml
@lang:lookup(record name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `record` | `record` | Record (entries array) to look the name up in |
| `name` | `string` | Entry name to look up |

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
