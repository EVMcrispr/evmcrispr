---
title: "assertions:assert-block-number"
---

Assert the current block number, on-chain.

## Syntax

```evml
assertions:assert-block-number <operator> <expected> [message]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `operator` | `string` | Comparison operator: ==, >, <, >=, <= |
| `expected` | `number` | Expected block number |
| `[message]` | `string` | Revert message when the assertion fails |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

assertions:assert-block-number >= 21000000 "too early"
```

## See Also
