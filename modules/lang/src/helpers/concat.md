---
title: "@lang:concat"
---

Concatenate arrays together.

**On-chain (`@lang:concat!`)**: Up to 4 parts may be live calls; each live part past the first is re-resolved by every later part's offset.

**Returns**: `array`

## Syntax

```evml
@lang:concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `array` | First array to concatenate |
| `[...rest]` | `array` | Additional arrays to append |

<!-- HAND-WRITTEN -->

## See Also

- [@flat](flat.md) — flatten nested arrays

## On-chain face (@concat!)

Concatenate the parts' word payloads on-chain through
`Operators.concat`. Each argument is a `::` call (or nested array face)
or a constant array literal.

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

set $safe 0x44fA8E6f47987339850636F88629646662444217

assert @concat!($safe::{caps()(uint256[])} [1 2]) == 0x1122
```

### See Also

- `assert`, `@flat!`, `@bytes.concat!`
