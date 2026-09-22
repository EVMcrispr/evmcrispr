---
title: "aragonos:new-token"
---

Create a new MiniMe token with configurable name, symbol, and decimals.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonos:new-token <variable> <name> <symbol> <controller> [decimals] [transferable]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable name |
| `name` | `string` | Runtime in smart blocks | Token name |
| `symbol` | `string` | Runtime in smart blocks | Token symbol |
| `controller` | `address` | Runtime in smart blocks | Token controller address |
| `[decimals]` | `number` | Runtime in smart blocks | Decimal places |
| `[transferable]` | `bool` | Runtime in smart blocks | Whether the token is transferable |

## Examples

```evml
# Create a standard MiniMe token
aragonos:new-token $token "My Token" "TKN" @me
```

<!-- HAND-WRITTEN -->

## See Also

- [new-dao](new-dao.md) — create a DAO
- [install](install.md) — install apps
