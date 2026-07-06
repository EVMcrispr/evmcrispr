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

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

token:approve $token $spender 100e18

# Revoke an allowance
token:approve $token $spender 0
```

## See Also

- [token:burn-from](burn-from.md) / [token:set-approval-for-all](set-approval-for-all.md)
