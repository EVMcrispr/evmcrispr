---
title: "@lang:find"
---

First element that satisfies the predicate; no match is an error.

**On-chain (`@lang:find!`)**: The predicate must be an Operators-backed helper reducing to one call, e.g. `@bool!(>= 100)`, with the element prepended to its arguments.

**Returns**: `any`

## Syntax

```evml
@lang:find(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — return all matches
- [@includes](includes.md) — check if element exists

## On-chain face (@find!)

The first matching element of the array return of a call: a
`filterWords` with the predicate (the same lambda machinery @filter!
uses) and a core `pick` of the kept payload's first word.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# The first cap at or above the floor is exactly the floor
assertions:assert @find!($vault::{caps()(uint256[])} @bool!(>= 100)) == 100
```

### Notes

- NO MATCH REVERTS the assertion at judge time: the pick lands past an
  empty kept payload. The off-chain @find raises its "no element
  matched" error at run time instead — there is no undefined result on
  either face.
- The element carries the array's element category (an address array
  yields an address-comparable word).

### See Also

- `assertions:assert`, `@filter!`, `@includes!`, `@any!`
