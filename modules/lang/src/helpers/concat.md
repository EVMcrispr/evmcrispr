---
title: "@lang:concat"
---

Concatenate arrays together. As @concat! the parts' word payloads concatenate on-chain through Operators.concat — constant arrays plus at most one live call part (spliced into the calldata last, at any argument position).

**Returns**: `array`

## Syntax

```evml
@lang:concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `array` | First array to concatenate (in @concat! a `::` call, nested array face, or constant array literal) |
| `[...rest]` | `array` | Additional arrays to append |

<!-- HAND-WRITTEN -->

## See Also

- [@flat](flat.md) — flatten nested arrays

## On-chain face (@concat!)

Concatenate the parts' word payloads on-chain through
`Operators.concat`. Each argument is a `::` call (or nested array face)
or a constant array literal; AT MOST ONE argument is live, spliced into
the calldata last (its ABI offset lets it sit at any argument
position).

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @concat!($safe::{caps()(uint256[])} [1 2]) == 0x1122
```

### See Also

- `assertions:assert`, `@flat!`, `@bytes.concat!`
