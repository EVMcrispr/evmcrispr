---
title: "assert-chainid"
---

Assert the chain ID equals an expected value, on-chain.

## Syntax

```evml
assert-chainid <expected> [message]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `expected` | `number` | Expected chain ID |
| `[message]` | `string` | Revert message when the assertion fails |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

# Ensure the transaction only executes on Ethereum mainnet
assertions:assert-chainid 1 "wrong chain"
```

## See Also
