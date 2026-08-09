---
title: "@lang:map"
---

Transform each element of an array by applying a helper. As @map! a mapWords over the array return of a call — the lambda names an Operators-backed helper (e.g. `@num!(* 2)`, the element prepended to its arguments) compiled into a single-call template; the result is the mapped words payload, composable with the other array faces.

**Returns**: `array`

## Syntax

```evml
@lang:map(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array (in @map! a `::` call expression or chain returning an array of single-word elements, or a nested array face) |
| `fn` | `helper` | Transform helper applied to each element (in @map! an Operators-backed single-call lambda, e.g. `@num!(* 2)`) |

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — keep elements by predicate
- [@reduce](reduce.md) — fold an array to a single value
- [loop](../../../std/src/commands/loop.md) — imperative iteration

## On-chain face (@map!)

Transform every element of the array return of a call on-chain through
`mapWords`. The lambda names an Operators-backed helper, applied with
the element prepended to its own arguments (`@num!(* 2)` maps each
element to `element * 2`), and must reduce to a single Operators call.

The result is the mapped words payload (a bytes value), composable with
the other array faces: `@reduce!(@map!(…) add 0)`, `@sort!(@map!(…))`.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# Sum of the doubled caps
assertions:assert @reduce!(@map!($vault::{caps()(uint256[])} @num!(* 2)) add 0) >= 100
```

### Notes

- Arrays of single-word elements only; the lambda output is one word
  per element.
- The signed sort recipe rides on @map!: flip the sign bit, sort,
  flip back.

### See Also

- `assertions:assert`, `@reduce!`, `@all!`
