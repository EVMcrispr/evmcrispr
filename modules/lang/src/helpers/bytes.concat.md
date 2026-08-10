---
title: "@lang:bytes.concat"
---

Concatenate bytes values together.

**On-chain (`@lang:bytes.concat!`)**: Up to 4 parts may be live calls, the rest hex constants; each live part past the first is re-resolved by every later offset.

**Returns**: `bytes`

## Syntax

```evml
@lang:bytes.concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `bytes` | First bytes value |
| `[...rest]` | `bytes` | Bytes values to append |

<!-- HAND-WRITTEN -->

## See Also

- [@concat](concat.md) — concatenate arrays
- [@str.concat](str.concat.md) — concatenate strings

## On-chain face (@bytes.concat!)

Concatenate bytes values on-chain through `Operators.concat`: constant
hex parts and live call parts.

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

set $oracle 0x44fA8E6f47987339850636F88629646662444217

assert @bytes.concat!(0x1234 $oracle::{blob()(bytes)}) == 0xabcd
```

### See Also

- `assert`, `@str.join!`, `@concat!`
