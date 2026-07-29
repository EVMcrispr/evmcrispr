---
title: "token:burn-from"
---

Burn tokens from another account, consuming the sender allowance (ERC20Burnable burnFrom function).

## Syntax

```evml
token:burn-from <amount> <token> <from> <account>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount in token units (wei) |
| `token` | `address` | Token address |
| `from` | `command` | Keyword `from` |
| `account` | `address` | Account to burn from |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
token:burn-from 100e18 $token from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

## Notes

- Consumes the sender allowance on the burned account, like transferFrom.

## See Also

- [token:approve](approve.md) — the account must approve the sender first
