---
title: "@lang:enumerate"
---

Pair every element of an array with its index.

**On-chain (`@lang:enumerate!`)**: The result is a record, readable with `@keys!`, `@values!` and `@lookup!`.

**Returns**: `array`

## Syntax

```evml
@lang:enumerate(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |

<!-- HAND-WRITTEN -->

## See Also

- [loop](../../../std/src/commands/loop.md) — iterate over arrays
- [@zip](zip.md) — combine two arrays into pairs

## On-chain face (@enumerate!)

Pair every element of the array return of a call with its index:
`zipWords(iotaWords(n), payload)` with `n` the array's LIVE length, so
the index lane always matches the element count at judge time.

The result is an ON-CHAIN RECORD: a zipped key/value word-pair payload
(the interleaved words `k0 v0 k1 v1 …` that zipWords produces), here
with indexes as the keys. The record faces consume it directly:
`@keys!`, `@values!`, `@lookup!`.

### Examples

```evml
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# The cap at index 2, through the record faces
assert @lookup!(@enumerate!($vault::{caps()(uint256[])}) 2) >= 100
```

### Notes

- Nested array faces work too: `@enumerate!(@sort!(…))` counts the
  nested payload's live words.
- Arrays of single-word elements only.

### See Also

- `assert`, `@zip!`, `@keys!`, `@values!`, `@lookup!`
