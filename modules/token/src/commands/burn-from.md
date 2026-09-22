---
title: "token:burn-from"
---

Burn tokens from another account, consuming the sender allowance (ERC20Burnable burnFrom function).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
token:burn-from <amount> <token> <from> <account>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `number` | Runtime in smart blocks | Amount in token units (wei) |
| `token` | `address` | Runtime in smart blocks | Token address |
| `from` | `command` | Build time | Keyword `from` |
| `account` | `address` | Runtime in smart blocks | Account to burn from |

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
