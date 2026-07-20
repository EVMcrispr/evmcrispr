---
title: "aragonos:revoke"
---

Revoke a permission from an entity on a DAO app, optionally removing the manager.

## Syntax

```evml
aragonos:revoke <role> <on> <app> <from> <grantee> [removeManager]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `role` | `permission` | Permission to revoke |
| `on` | `command` | Keyword `on` |
| `app` | `app` | Target app |
| `from` | `command` | Keyword `from` |
| `grantee` | `address` | Address whose permission is revoked |
| `[removeManager]` | `bool` | Also remove the permission manager |

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
