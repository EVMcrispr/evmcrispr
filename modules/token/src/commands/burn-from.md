---
title: "token:burn-from"
---

Burn tokens from another account, consuming the sender allowance (ERC20Burnable burnFrom function).

## Syntax

```evml
token:burn-from <token> <from> <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token address |
| `from` | `address` | Account to burn from |
| `amount` | `number` | Amount in token units (wei) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
token:burn-from $token 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 100e18
```

## Notes

- Consumes the sender allowance on the burned account, like transferFrom.

## See Also

- [token:approve](approve.md) — the account must approve the sender first
