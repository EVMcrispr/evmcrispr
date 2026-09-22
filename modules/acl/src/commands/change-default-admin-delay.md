---
title: "acl:change-default-admin-delay"
---

Schedule a change of the delay applied to future default admin transfers.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:change-default-admin-delay <contract> <delay>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `contract` | `address` | Runtime in smart blocks | AccessControlDefaultAdminRules contract address |
| `delay` | `number` | Runtime in smart blocks | New delay, in time units (e.g. 5d) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

# Move to a 5-day delay for future admin transfers
acl:change-default-admin-delay $token 5d
```

## Notes

- The change itself is delayed: increases wait for the new delay, decreases
  wait for the difference. A scheduled change can be undone with
  [acl:rollback-default-admin-delay](rollback-default-admin-delay.md).

## See Also

- [@acl:defaultAdminDelay](../helpers/defaultAdminDelay.md)
