---
title: "@lang:any"
---

Whether at least one element satisfies the predicate.

**On-chain (`@lang:any!`)**: The predicate is a named `def @name!` of one parameter returning bool, applied by name.

**Returns**: `bool`

## Syntax

```evml
@lang:any(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## See Also

- [@all](all.md) — true if all match
- [@filter](filter.md) — keep matching elements

## On-chain face (@any!)

Check whether at least one element of the array return of a call passes a
predicate, on-chain: a `foldWords` with the Any exit (init 0), stopping at
the first pass.

The predicate names an Operators-backed helper compiled into a lambda
template with the element prepended to the reference's own arguments:
A def of one parameter returning bool: `def @isZero! "$x: number ->
bool" @bool!($x == 0)` tests `element == 0`. A body reducing to ONE
Operators call becomes a single-staticcall template; a composed one —
a nested live call, a multi-call expression — routes through the core
and costs several staticcalls per element instead of one.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# Some cap is unset
def @isZero! "$x: number -> bool" @bool!($x == 0)
assertions:assert @any!($vault::{caps()(uint256[])} @isZero!) == false
```

### Notes

- Arrays of single-word elements only.
- An empty array is false (the fold returns its init).

### See Also

- `assertions:assert`, `@all!`, `@includes!`
