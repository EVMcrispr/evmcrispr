---
title: "token:approve"
---

Approve a spender for an ERC20 token allowance.

## Syntax

```evml
token:approve <token> <spender> <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token address |
| `spender` | `address` | Spender address |
| `amount` | `number` | Allowance in token units (wei) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

token:approve $token $spender 100e18

# Revoke an allowance
token:approve $token $spender 0
```

## See Also

- [token:burn-from](burn-from.md) / [token:set-approval-for-all](set-approval-for-all.md)
