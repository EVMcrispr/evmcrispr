---
title: "@acl:roleAdmin"
---

Admin role that controls a role: a bytes32 value on AccessControl contracts, a role id on AccessManagers.

**Returns**: `bytes32 | number`

## Syntax

```evml
@acl:roleAdmin(target role)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | AccessControl contract or AccessManager address |
| `role` | `number \| string` | Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# bytes32 admin role of an AccessControl role
print @acl:roleAdmin($token MINTER_ROLE)

# numeric admin role of an AccessManager role
print @acl:roleAdmin($manager 42)
```

## See Also

- [acl:set-role-admin](../commands/set-role-admin.md)
