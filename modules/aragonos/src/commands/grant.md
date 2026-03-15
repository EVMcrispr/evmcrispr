# aragonos:grant

Grant a permission on a DAO app to an entity, with an optional oracle.

## Syntax

```
aragonos:grant <grantee> <app> <role> [permissionManager]
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| grantee | `address` | Yes |
| app | `app` | Yes |
| role | `permission` | Yes |
| permissionManager | `app` | No |

## Options

| Name | Type |
|------|------|
| --oracle | `address` |

<!-- HAND-WRITTEN -->









## Examples

```
# Grant a role to the connected wallet
grant @me @app(voting) CREATE_VOTES_ROLE

# Grant with a permission manager
grant @app(voting) @app(token-manager) WRAP_TOKEN_ROLE @app(voting)

# Grant with an oracle
grant @app(voting) @app(token-manager) WRAP_TOKEN_ROLE --oracle @app(token-manager)

# Cross-DAO grant (inside nested connect)
grant @app(voting) @app(_0xDAO1...:voting) CREATE_VOTES_ROLE
```

## See Also

- [revoke](revoke.md) — remove permissions
- [connect](connect.md) — establish DAO context
- [@app](../helpers/app.md) — resolve app addresses
