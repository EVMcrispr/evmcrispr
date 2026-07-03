---
title: "token:burn"
---

Burn tokens from the connected account (ERC20Burnable burn function).

## Syntax

```evml
token:burn <token> <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token address |
| `amount` | `number` | Amount in token units (wei) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

token:burn $token 100e18
```

## Notes

- Burns from the connected account (ERC20Burnable).

## See Also

- [token:burn-from](burn-from.md) — burn from another account via allowance
