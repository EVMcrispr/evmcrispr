---
title: "@lang:map"
---

Transform each element of an array by applying a helper.

**On-chain (`@lang:map!`)**: The transform is an Operators-backed helper, e.g. `@num!(* 2)`, with the element prepended to its arguments; a composed transform costs more per element.

**Returns**: `array`

## Syntax

```evml
@lang:map(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Transform helper applied to each element |

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — keep elements by predicate
- [@reduce](reduce.md) — fold an array to a single value
- [loop](../../../std/src/commands/loop.md) — imperative iteration

## On-chain face (@map!)

Transform every element of the array return of a call on-chain through
`mapWords`. The lambda names an Operators-backed helper, applied with
the element prepended to its own arguments (`@num!(* 2)` maps each
element to `element * 2`). A lambda reducing to one Operators call runs
as a single staticcall per element; a composed one (a nested live call,
a multi-call expression like `@num!(* 2 + 1)`) routes through the core
and costs several.

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
