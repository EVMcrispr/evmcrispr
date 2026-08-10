---
title: "@lang:sort"
---

Sort an array using a comparator helper.

**On-chain (`@lang:sort!`)**: Sorts in unsigned ascending order and takes no comparator; signed values sort by their raw word, so negatives need the sign-flip recipe.

**Returns**: `array`

## Syntax

```evml
@lang:sort(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Comparator helper returning a number |

<!-- HAND-WRITTEN -->

## See Also

- [@reverse](reverse.md) — reverse an array

## On-chain face (@sort!)

Sort the word payload of the array return of a call on-chain through
`sortWords`: UNSIGNED ascending word order, insertion sort (O(n2) gas,
fine for the short arrays assertions read). No comparator.

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

# Set-uniqueness: sorted then adjacent-deduped
assertions:assert @unique!(@sort!($safe::{getOwners()(address[])})) == 0x1122
```

### Notes

- Sign-flip recipe (the signed sort): map the sign bit away, sort, map
  it back. Flipping the top bit maps signed order onto unsigned order
  exactly, and unlike adding 2^255 it can never overflow. Name the flip
  once and apply it on the way in and on the way out:

  ```evml
  def @flip! "$x: bytes32 -> bytes32" @bytes!($x "xor" 0x8000000000000000000000000000000000000000000000000000000000000000)
  set $sorted @map!(@sort!(@map!($c::{vals()(int256[])} @flip!)) @flip!)
  ```
- The result is a words payload (bytes), composable with the other
  array faces.

### See Also

- `assertions:assert`, `@unique!`, `@map!`
