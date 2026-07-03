---
title: "access-control:set-target-closed"
---

Close or reopen a contract managed by an AccessManager. While closed, all calls to its restricted functions revert.

## Syntax

```evml
access-control:set-target-closed <manager> <target> <closed>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `target` | `address` | Managed contract address |
| `closed` | `bool` | true to close, false to reopen |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

# Emergency-stop every restricted function of the managed token
access-control:set-target-closed $manager $token true

# Reopen it
access-control:set-target-closed $manager $token false
```

## Notes

- While closed, all restricted calls to the target revert regardless of
  roles — including for admins.

## See Also

- [access-control:set-target-function-role](set-target-function-role.md) — per-function roles
