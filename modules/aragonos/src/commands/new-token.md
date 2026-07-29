---
title: "aragonos:new-token"
---

Create a new MiniMe token with configurable name, symbol, and decimals.

## Syntax

```evml
aragonos:new-token <variable> <name> <symbol> <controller> [decimals] [transferable]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable name |
| `name` | `string` | Token name |
| `symbol` | `string` | Token symbol |
| `controller` | `address` | Token controller address |
| `[decimals]` | `number` | Decimal places |
| `[transferable]` | `bool` | Whether the token is transferable |

## Examples

```evml
# Create a standard MiniMe token
aragonos:new-token $token "My Token" "TKN" @me
```

<!-- HAND-WRITTEN -->

## See Also

- [new-dao](new-dao.md) — create a DAO
- [install](install.md) — install apps
