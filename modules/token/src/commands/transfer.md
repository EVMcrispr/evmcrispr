---
title: "token:transfer"
---

Transfer ERC20 tokens from the connected account to a recipient.

## Syntax

```evml
token:transfer <amount> <token> <to> <recipient>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount in token units (wei) |
| `token` | `address` | Token address |
| `to` | `command` | Keyword `to` |
| `recipient` | `address` | Recipient |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $recipient 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

token:transfer 100e18 $token to $recipient

# Transfer using a human-readable amount
token:transfer @token:amount(DAI 50) @token(DAI) to $recipient
```

## See Also

- [token:transfer-from](transfer-from.md) / [token:disperse](disperse.md)
- [@token:balance](../helpers/balance.md)
