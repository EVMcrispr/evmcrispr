---
title: "token:approve"
---

Approve a spender for an ERC20 token allowance.

## Syntax

```evml
token:approve <amount> <token> <for> <spender>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Allowance in token units (wei) |
| `token` | `address` | Token address |
| `for` | `command` | Keyword `for` |
| `spender` | `address` | Spender address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

token:approve 100e18 $token for $spender

# Revoke an allowance
token:approve 0 $token for $spender
```

## See Also

- [token:burn-from](burn-from.md) / [token:set-approval-for-all](set-approval-for-all.md)
