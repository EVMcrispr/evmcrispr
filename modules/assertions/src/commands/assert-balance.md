---
title: "assertions:assert-balance"
---

Assert the native balance of an account, on-chain.

## Syntax

```evml
assertions:assert-balance <account> <operator> <expected> [message]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `account` | `address` | Account to check |
| `operator` | `string` | Comparison operator: ==, >, <, >=, <=, ~= |
| `expected` | `number` | Expected balance in wei |
| `[message]` | `string` | Revert message when the assertion fails |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--delta` | `number` | Allowed delta for the ~= (approximate) operator |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

# Require an account to hold more than 1 ETH
assertions:assert-balance @me > 1e18 "needs ETH"

# Approximate balance within a delta
assertions:assert-balance @me ~= 5e18 --delta 1e17 "balance drifted"
```

## See Also
