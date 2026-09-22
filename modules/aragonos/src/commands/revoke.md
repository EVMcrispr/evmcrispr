---
title: "aragonos:revoke"
---

Revoke a permission from an entity on a DAO app, optionally removing the manager.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonos:revoke <role> <on> <app> <from> <grantee> [removeManager]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `role` | `permission` | Build time | Permission to revoke |
| `on` | `command` | Build time | Keyword `on` |
| `app` | `app` | Build time | Target app |
| `from` | `command` | Build time | Keyword `from` |
| `grantee` | `address` | Runtime in smart blocks | Address whose permission is revoked |
| `[removeManager]` | `bool` | Build time | Also remove the permission manager |

## Examples

```evml
# Revoke a permission
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  aragonos:revoke CREATE_PERMISSIONS_ROLE on @aragonos:app(acl) from @aragonos:app(disputable-voting.open)
)
```

<!-- HAND-WRITTEN -->

## See Also

- [grant](grant.md) — grant permissions
- [connect](connect.md) — connect to a DAO
