---
title: "@lang:all"
---

Return true if every element satisfies the predicate. As @all! a foldWords over the array return of a call with the All exit — the predicate names an Operators-backed helper (e.g. `@bool!(> 0)`, the element prepended to its arguments) compiled into a single-call lambda template.

**Returns**: `bool`

## Syntax

```evml
@lang:all(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array (in @all! a `::` call expression or chain returning an array of single-word elements) |
| `fn` | `helper` | Predicate helper returning bool (in @all! an Operators-backed single-call predicate, e.g. `@bool!(>= 100)`) |

<!-- HAND-WRITTEN -->

## See Also

- [@any](any.md) — true if at least one matches
- [@filter](filter.md) — keep matching elements

## On-chain face (@all!)

Check every element of the array return of a call against a predicate,
on-chain: a `foldWords` with the All exit (init 1), stopping at the first
failure.

The predicate names an Operators-backed helper and is compiled into a
single-staticcall lambda template with the element prepended to the
reference's own arguments: `@bool!(>= 100)` tests `element >= 100`,
`@not!` tests `element == 0`. Anything that does not reduce to ONE
Operators call over the element (nested live calls, multi-call
expressions) is rejected at build time.

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
