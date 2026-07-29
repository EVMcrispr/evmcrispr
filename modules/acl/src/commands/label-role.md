---
title: "acl:label-role"
---

Attach a human-readable label to an AccessManager role (emitted as an event for off-chain indexing).

## Syntax

```evml
acl:label-role <manager> <roleId> <label>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `roleId` | `number \| string` | Role id (or ADMIN_ROLE / PUBLIC_ROLE) |
| `label` | `string` | Human-readable role name |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
acl:label-role $manager 42 "Treasury manager"
```

## Notes

- Labels are only emitted as `RoleLabel` events for off-chain tooling; they
  are not stored on-chain.

## See Also

- [acl:grant](grant.md) — grant the role to accounts
