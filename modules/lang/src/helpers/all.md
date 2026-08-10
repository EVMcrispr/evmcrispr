---
title: "@lang:all"
---

Whether every element satisfies the predicate.

**On-chain (`@lang:all!`)**: The predicate is an Operators-backed helper, e.g. `@bool!(> 0)`, with the element prepended to its arguments; a composed predicate costs more per element.

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

The predicate names an Operators-backed helper and is compiled into a
lambda template with the element prepended to the reference's own
arguments: `@bool!(>= 100)` tests `element >= 100`, `@not!` tests
`element == 0`. A predicate reducing to ONE Operators call becomes a
single-staticcall template; a composed one — a nested live call, a
multi-call expression like `@bool!(> $vault::floor())` — routes through
the core, which resolves the expression per element at several
staticcalls each. Both compile; the one-call form is the cheap one.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# Every cap at least 100
assertions:assert @all!($vault::{caps()(uint256[])} @bool!(>= 100))

# No flag set
assertions:assert @all!($vault::{flags()(bool[])} @not!)
```

### Notes

- Arrays of single-word elements only.
- An empty array is vacuously true (the fold returns its init).

### See Also

- `assertions:assert`, `@any!`, `@reduce!`
