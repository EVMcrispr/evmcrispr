---
title: "access-control:revoke"
---

Revoke a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids).

## Syntax

```evml
access-control:revoke <target> <role> <account>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | AccessControl contract or AccessManager address |
| `role` | `number \| string` | Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id |
| `account` | `address` | Account to revoke from |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# AccessControl
access-control:revoke $token MINTER_ROLE 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# AccessManager
access-control:revoke $manager 42 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

## Notes

- Role resolution follows the same rules as [access-control:grant](grant.md): string
  roles are AccessControl bytes32 roles, numeric ids are AccessManager roles.
- The sender must hold the role's admin role.

## See Also

- [access-control:grant](grant.md) — grant a role
- [@access-control.hasRole](../helpers/access-control.hasRole.md) — check membership
