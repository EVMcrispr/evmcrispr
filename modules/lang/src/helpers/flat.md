---
title: "@lang:flat"
---

Flatten one level of nesting in an array.

**On-chain (`@lang:flat!`)**: Up to 4 elements may be live calls, the rest constant arrays; each live element past the first is re-resolved by every later offset.

**Returns**: `array`

## Syntax

```evml
@lang:flat(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array of arrays |

<!-- HAND-WRITTEN -->

## See Also

- [@concat](concat.md) — concatenate arrays
- [@map](map.md) — transform then flatten with `@flat(@map(...))`

## On-chain face (@flat!)

Concatenate the word payloads of an array literal's parts on-chain
through `Operators.concat`. Parts are constant arrays or `::` call
parts.

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

assert @flat!([[1 2] $safe::{caps()(uint256[])}]) == 0x1122
```

### See Also

- `assert`, `@concat!`
