---
title: "@assertions:bool!"
---

Compose live comparisons with on-chain logic (and, or, xor, not), evaluated at assertion time via the combinators contract.

**Returns**: `bool`

## Syntax

```evml
@assertions:bool!(...expression)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...expression]` | `any` | Comparisons and word logic operators over `::` calls, on-chain helpers and constants |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# Either condition may hold — evaluated on-chain, no snapshot staleness
assertions:assert @bool!(($gov::{quorum()(uint256)} > 0) or ($gov::{votes()(uint256)} > 10))

# not compiles to notBool; a bare not-assertion becomes assertFalse
assertions:assert @bool!(not $gov::{paused()(bool)})
```

## Notes

- Vocabulary mirrors std's `@bool`: comparisons `== != < <= > >=` and the
  word operators `and`, `or`, `xor`, prefix `not`. Arithmetic belongs in
  `@num!(…)`.
- `logicBool` never short-circuits: both operands are evaluated on-chain.

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:num!](num-bang.md)
