---
title: "token:burn"
---

Burn tokens from the connected account (ERC20Burnable burn function).

## Syntax

```evml
token:burn <amount> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount in token units (wei) |
| `token` | `address` | Token address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
token:burn 100e18 $token
```

## Notes

- Burns from the connected account (ERC20Burnable).

## See Also

- [token:burn-from](burn-from.md) — burn from another account via allowance
