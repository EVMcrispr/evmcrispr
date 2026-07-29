---
title: "acl:cancel-scheduled"
---

Cancel a scheduled AccessManager operation. Callable by its scheduler, a guardian of the required role, or an admin.

## Syntax

```evml
acl:cancel-scheduled <manager> <caller> <target> <signature> [...params]
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
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

acl:cancel-scheduled $manager @me $token "setDuration(uint256)" 1y
```

## Notes

- Callable by the account that scheduled the operation, a guardian of the
  required role, or an ADMIN_ROLE member.

## See Also

- [acl:schedule](schedule.md)
- [acl:set-role-guardian](set-role-guardian.md) — configure who can cancel
