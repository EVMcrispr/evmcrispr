---
title: "acl:set-role-guardian"
---

Set the guardian role allowed to cancel scheduled operations of an AccessManager role.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:set-role-guardian <manager> <roleId> <guardianRoleId>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `manager` | `address` | Runtime in smart blocks | AccessManager address |
| `roleId` | `number \| string` | Build time | Role id (or ADMIN_ROLE / PUBLIC_ROLE) |
| `guardianRoleId` | `number \| string` | Build time | New guardian role id |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# Let role 3 cancel scheduled operations of role 42 members
acl:set-role-guardian $manager 42 3
```

## Notes

- Guardians can cancel scheduled (delayed) operations of the role's members.
- Only members of the AccessManager `ADMIN_ROLE` (role 0) can change role
  guardians.

## See Also

- [acl:set-role-admin](set-role-admin.md) — set the managing role
