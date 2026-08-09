---
title: "@lang:filter"
---

Keep elements of an array for which a helper returns truthy. As @filter! a filterWords over the array return of a call — the predicate names an Operators-backed helper (e.g. `@bool!(> 0)`, the element prepended to its arguments) compiled into a single-call lambda template; the result is the kept words payload, composable with the other array faces.

**Returns**: `array`

## Syntax

```evml
@lang:filter(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array (in @filter! a `::` call expression or chain returning an array of single-word elements, or a nested array face) |
| `fn` | `helper` | Predicate helper returning bool (in @filter! an Operators-backed single-call predicate, e.g. `@bool!(>= 100)`) |

<!-- HAND-WRITTEN -->

## See Also

- [@find](find.md) — return the first match
- [@all](all.md) — check if all elements match
- [@any](any.md) — check if any element matches
- [@map](map.md) — transform each element

## On-chain face (@filter!)

Keep the matching elements of the array return of a call on-chain
through `filterWords`. The predicate names an Operators-backed helper,
applied with the element prepended to its own arguments
(`@bool!(>= 100)` keeps each element with `element >= 100`), and must
reduce to a single Operators call — the same lambda machinery @map!
and @all! use.

The result is the kept words payload (a bytes value) in source order,
composable with the other array faces: `@len!(@filter!(…))`,
`@reduce!(@filter!(…) add 0)`, `@sort!(@filter!(…))`.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# Exactly two caps at or above the floor
assertions:assert @len!(@filter!($vault::{caps()(uint256[])} @bool!(>= 100))) == 2
```

### Notes

- Arrays of single-word elements only; the output length is the kept
  count, so the payload nests into @len!, @at!, the folds and the other
  word ops.
- One staticcall per element: gas bounds the practical array size.

### See Also

- `assertions:assert`, `@map!`, `@find!`, `@all!`
