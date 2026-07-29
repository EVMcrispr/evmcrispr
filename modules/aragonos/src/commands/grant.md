---
title: "aragonos:grant"
---

Grant a permission on a DAO app to an entity, with an optional oracle.

## Syntax

```evml
aragonos:grant <role> <on> <app> <to> <grantee> [permissionManager]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `role` | `permission` | Permission identifier |
| `on` | `command` | Keyword `on` |
| `app` | `app` | Target app |
| `to` | `command` | Keyword `to` |
| `grantee` | `address` | Address to grant the permission to |
| `[permissionManager]` | `app` | Entity managing this permission |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--oracle` | `address` | ACL oracle contract address |

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
