---
title: "access-control:label-role"
---

Attach a human-readable label to an AccessManager role (emitted as an event for off-chain indexing).

## Syntax

```evml
access-control:label-role <manager> <roleId> <label>
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
load access-control

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
access-control:label-role $manager 42 "Treasury manager"
```

## Notes

- Labels are only emitted as `RoleLabel` events for off-chain tooling; they
  are not stored on-chain.

## See Also

- [access-control:grant](grant.md) — grant the role to accounts
