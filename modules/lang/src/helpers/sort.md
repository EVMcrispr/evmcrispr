---
title: "@lang:sort"
---

Sort an array using a comparator helper. As @sort! the array return of a call sorted on-chain through sortWords: UNSIGNED ascending word order, no comparator (see the docs for the signed recipe via @map!).

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

- Signed recipe: map the sign bit away, sort, map it back:
  `@map!(@sort!(@map!($c::{vals()(int256[])} @bytes!("xor" 0x8000000000000000000000000000000000000000000000000000000000000000))) @bytes!("xor" 0x8000000000000000000000000000000000000000000000000000000000000000))`.
- The result is a words payload (bytes), composable with the other
  array faces.

### See Also

- `assertions:assert`, `@unique!`, `@map!`
