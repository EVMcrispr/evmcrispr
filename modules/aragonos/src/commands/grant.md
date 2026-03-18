---
title: "aragonos:grant"
---

Grant a permission on a DAO app to an entity, with an optional oracle.

## Syntax

```evml
aragonos:grant <grantee> <app> <role> [permissionManager]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `grantee` | `address` |  |
| `app` | `app` | Target app |
| `role` | `permission` | Permission identifier |
| `[permissionManager]` | `app` | Entity managing this permission |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--oracle` | `address` | ACL oracle contract address |

## Examples

```evml
# Grant a role to the connected wallet
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  grant @me @app(agent) TRANSFER_ROLE
)
```

<!-- HAND-WRITTEN -->

## See Also

- [revoke](revoke.md) — remove permissions
- [connect](connect.md) — establish DAO context
- [@app](../helpers/app.md) — resolve app addresses
