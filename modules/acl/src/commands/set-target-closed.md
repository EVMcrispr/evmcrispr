---
title: "acl:set-target-closed"
---

Close or reopen a contract managed by an AccessManager. While closed, all calls to its restricted functions revert.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:set-target-closed <manager> <target> <closed>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `manager` | `address` | Runtime in smart blocks | AccessManager address |
| `target` | `address` | Runtime in smart blocks | Managed contract address |
| `closed` | `bool` | Runtime in smart blocks | true to close, false to reopen |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

# Emergency-stop every restricted function of the managed token
acl:set-target-closed $manager $token true

# Reopen it
acl:set-target-closed $manager $token false
```

## Notes

- While closed, all restricted calls to the target revert regardless of
  roles — including for admins.

## See Also

- [acl:set-target-function-role](set-target-function-role.md) — per-function roles
