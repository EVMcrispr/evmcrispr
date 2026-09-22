---
title: "token:burn"
---

Burn tokens from the connected account (ERC20Burnable burn function).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
token:burn <amount> <token>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `number` | Runtime in smart blocks | Amount in token units (wei) |
| `token` | `address` | Runtime in smart blocks | Token address |

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
