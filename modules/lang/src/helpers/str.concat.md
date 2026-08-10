---
title: "@lang:str.concat"
---

Concatenate strings together.

**On-chain (`@lang:str.concat!`)**: Up to 4 parts may be live calls, the rest string constants; each live part past the first is re-resolved by every later offset.

**Returns**: `string`

## Syntax

```evml
@lang:str.concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `string` | First string segment |
| `[...rest]` | `string` | Strings to append |

<!-- HAND-WRITTEN -->

## See Also

- [@str.join](str.join.md) — join array elements with a delimiter
- [@concat](concat.md) — concatenate arrays

## On-chain face (@str.concat!)

Concatenate the parts on-chain through a single `concat` call: the
@bytes.concat! compile body with the String category. Constant string
parts and live call parts.

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
load lang

set $reg 0x44fA8E6f47987339850636F88629646662444217

assert @str.concat!("v" $reg::{version()(string)}) == "v2"
```

### Notes

- Up to four live parts; past that the build fails rather than risking
  an out-of-gas judge that would read as a failed assertion.
- For a delimiter between the parts use `@str.join!` — it compiles to
  the same single concat with the delimiter interleaved at composition
  time.

### See Also

- `assert`, `@str.join!`, `@bytes.concat!`
