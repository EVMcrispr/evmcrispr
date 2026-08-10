---
title: "@lang:all"
---

Whether every element satisfies the predicate.

**On-chain (`@lang:all!`)**: The predicate is a named `def @name!` of one parameter returning bool, applied by name.

**Returns**: `bool`

## Syntax

```evml
@lang:all(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## See Also

- [@any](any.md) — true if at least one matches
- [@filter](filter.md) — keep matching elements

## On-chain face (@all!)

Check every element of the array return of a call against a predicate,
on-chain: a `foldWords` with the All exit (init 1), stopping at the first
failure.

The predicate is a `def @name!` of one parameter returning bool, applied
by name. Its parameter substitutes wherever the body names it. `def @ge100! "$x:
number -> bool" @bool!($x >= 100)` tests `element >= 100`; a body of `@not!($x)` tests
`element == 0`. A predicate reducing to ONE Operators call becomes a
single-staticcall template; a composed one — a nested live call, a
multi-call body like `@bool!($x > $vault::floor())` — routes through
the core, which resolves the expression per element at several
staticcalls each. Both compile; the one-call form is the cheap one.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# Every cap at least 100
def @ge100! "$x: number -> bool" @bool!($x >= 100)
assertions:assert @all!($vault::{caps()(uint256[])} @ge100!)

# No flag set
def @isOff! "$x: bool -> bool" @not!($x)
assertions:assert @all!($vault::{flags()(bool[])} @isOff!)
```

### Notes

- Arrays of single-word elements only.
- An empty array is vacuously true (the fold returns its init).

### See Also

- `assertions:assert`, `@any!`, `@reduce!`
