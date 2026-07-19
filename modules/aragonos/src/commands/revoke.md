---
title: "aragonos:revoke"
---

Revoke a permission from an entity on a DAO app, optionally removing the manager.

## Syntax

```evml
aragonos:revoke <grantee> <app> <role> [removeManager]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `grantee` | `address` | Address whose permission is revoked |
| `app` | `app` | Target app |
| `role` | `permission` | Permission to revoke |
| `[removeManager]` | `bool` | Also remove the permission manager |

## Examples

```evml
# Revoke a permission
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  aragonos:revoke @aragonos:app(disputable-voting.open) @aragonos:app(acl) CREATE_PERMISSIONS_ROLE
)
```

<!-- HAND-WRITTEN -->

## See Also

- [grant](grant.md) — grant permissions
- [connect](connect.md) — connect to a DAO
