---
title: "aragonos:grant"
---

Grant a permission on a DAO app to an entity, with an optional oracle.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonos:grant <role> <on> <app> <to> <grantee> [permissionManager]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `role` | `permission` | Build time | Permission identifier |
| `on` | `command` | Build time | Keyword `on` |
| `app` | `app` | Build time | Target app |
| `to` | `command` | Build time | Keyword `to` |
| `grantee` | `address` | Runtime in smart blocks | Address to grant the permission to |
| `[permissionManager]` | `app` | Build time | Entity managing this permission |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--oracle` | `address` | Build time | ACL oracle contract address |

## Examples

```evml
# Grant a role to the connected wallet
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  aragonos:grant TRANSFER_ROLE on @aragonos:app(agent) to @me
)
```

<!-- HAND-WRITTEN -->

## See Also

- [revoke](revoke.md) — remove permissions
- [connect](connect.md) — establish DAO context
- [@app](../helpers/app.md) — resolve app addresses
