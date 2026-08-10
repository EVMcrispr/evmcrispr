---
title: "@lang:flat"
---

Flatten one level of nesting in an array.

**On-chain (`@lang:flat!`)**: At most one element may be a live call; the rest must be constant arrays.

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
parts; AT MOST ONE part is live, spliced into the calldata last (its
ABI offset lets it sit at any logical position).

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @flat!([[1 2] $safe::{caps()(uint256[])}]) == 0x1122
```

### See Also

- `assertions:assert`, `@concat!`
