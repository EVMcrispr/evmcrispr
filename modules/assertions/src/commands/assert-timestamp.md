---
title: "assert-timestamp"
---

Assert the current block timestamp, on-chain.

## Syntax

```evml
assert-timestamp <operator> <expected> [message]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `operator` | `string` | Comparison operator: ==, >, <, >=, <= |
| `expected` | `number` | Expected block timestamp (unix seconds) |
| `[message]` | `string` | Revert message when the assertion fails |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

assertions:assert-timestamp >= 1893456000 "unlock period not reached"
```

## See Also
