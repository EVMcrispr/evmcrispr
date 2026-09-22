---
title: "acl:cancel-scheduled"
---

Cancel a scheduled AccessManager operation. Callable by its scheduler, a guardian of the required role, or an admin.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:cancel-scheduled <manager> <caller> <target> <signature> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `manager` | `address` | Runtime in smart blocks | AccessManager address |
| `caller` | `address` | Runtime in smart blocks | Account that scheduled the operation |
| `target` | `address` | Runtime in smart blocks | Managed contract address |
| `signature` | `write-abi` | Build time | Function of the scheduled call |
| `[...params]` | `any` | Runtime in smart blocks | Arguments matching the signature types |

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
