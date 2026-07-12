---
title: "access-control:set-role-admin"
---

Set the admin role that manages grants and revocations of an AccessManager role.

## Syntax

```evml
access-control:set-role-admin <manager> <roleId> <adminRoleId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `roleId` | `number \| string` | Role id (or ADMIN_ROLE / PUBLIC_ROLE) |
| `adminRoleId` | `number \| string` | New admin role id |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# Let role 2 manage grants and revocations of role 42
access-control:set-role-admin $manager 42 2
```

## Notes

- Only members of the AccessManager `ADMIN_ROLE` (role 0) can change role
  admins.

## See Also

- [access-control:set-role-guardian](set-role-guardian.md) — set the cancelling role
- [@access-control:roleAdmin](../helpers/roleAdmin.md) — read the current admin role
