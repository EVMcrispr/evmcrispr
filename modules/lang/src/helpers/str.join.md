---
title: "@lang:str.join"
---

Join array elements into a string with a delimiter.

**On-chain (`@lang:str.join!`)**: Up to 4 elements may be live calls, the rest string constants; each live element past the first is re-resolved by every later offset.

**Returns**: `string`

## Syntax

```evml
@lang:str.join(arr delim)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `delim` | `string` | Delimiter string |

<!-- HAND-WRITTEN -->

## See Also

- [@str.split](str.split.md) — split a string into an array
- [@str.concat](str.concat.md) — concatenate strings

## On-chain face (@str.join!)

Join parts with a delimiter through a SINGLE `concat` call — there is
no join function on-chain. The delimiter interleaves between the parts
at composition time, and constant runs (part, delimiter, part, …)
merge into one constant concat part, so `["v" $reg::version()]` with
`"."` compiles to `concat(["v.", <live>])`. The parts list is an array
literal of constant strings and live call parts.

Up to four parts may be live. The envelopes splice into the calldata in
order at the end, and each offset after the first live part is itself a
live word: the constant base plus the running total of the earlier
payloads, rounded up to whole words. A part may still sit at any logical
position, since its ABI offset points at the splice rather than at where
it reads.

Four is a hard limit rather than a guideline. An operand expression is a
tree with no way to name a subterm, so each live part is re-resolved by
every offset that follows it — source call included — which is N(N-1)/2
extra resolutions and a calldata blob growing with the square. An
assertion is judged inside an `eth_call`, so an over-budget expression
runs out of gas and reverts, and a reverted judge cannot be told apart
from one that legitimately failed. Better to refuse at build time.

### Examples

```evml
load assertions
load lang

set $reg 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @str.join!(["v" $reg::{version()(string)}] ".") == "v.2"
```

### Notes

- Up to four live parts; past that the build fails rather than risking
  an out-of-gas judge that would read as a failed assertion.
- An empty delimiter concatenates the parts.

### See Also

- `assertions:assert`, `@str.split!`, `@bytes.concat!`
