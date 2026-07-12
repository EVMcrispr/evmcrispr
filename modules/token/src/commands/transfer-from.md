---
title: "token:transfer-from"
---

Transfer ERC20 tokens from one account to another, consuming the sender allowance.

## Syntax

```evml
token:transfer-from <token> <from> <to> <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token address |
| `from` | `address` | Account to debit |
| `to` | `address` | Recipient |
| `amount` | `number` | Amount in token units (wei) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# Pull previously approved tokens into the connected account
token:transfer-from $token $from @me 100e18
```

## See Also

- [token:transfer](transfer.md) / [token:approve](approve.md)
- [@token.allowance](../../../std/src/helpers/token.allowance.md)
