---
title: "access-control:set-role-guardian"
---

Set the guardian role allowed to cancel scheduled operations of an AccessManager role.

## Syntax

```evml
access-control:set-role-guardian <manager> <roleId> <guardianRoleId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `roleId` | `number \| string` | Role id (or ADMIN_ROLE / PUBLIC_ROLE) |
| `guardianRoleId` | `number \| string` | New guardian role id |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

# Let role 3 cancel scheduled operations of role 42 members
access-control:set-role-guardian $manager 42 3
```

## Notes

- Guardians can cancel scheduled (delayed) operations of the role's members.
- Only members of the AccessManager `ADMIN_ROLE` (role 0) can change role
  guardians.

## See Also

- [access-control:set-role-admin](set-role-admin.md) — set the managing role
