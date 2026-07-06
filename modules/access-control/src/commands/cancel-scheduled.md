---
title: "access-control:cancel-scheduled"
---

Cancel a scheduled AccessManager operation. Callable by its scheduler, a guardian of the required role, or an admin.

## Syntax

```evml
access-control:cancel-scheduled <manager> <caller> <target> <signature> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `caller` | `address` | Account that scheduled the operation |
| `target` | `address` | Managed contract address |
| `signature` | `write-abi` | Function of the scheduled call |
| `[...params]` | `any` | Arguments matching the signature types |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

access-control:cancel-scheduled $manager @me $token "setDuration(uint256)" 31536000
```

## Notes

- Callable by the account that scheduled the operation, a guardian of the
  required role, or an ADMIN_ROLE member.

## See Also

- [access-control:schedule](schedule.md)
- [access-control:set-role-guardian](set-role-guardian.md) — configure who can cancel
