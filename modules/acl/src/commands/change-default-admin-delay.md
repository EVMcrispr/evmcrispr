---
title: "acl:change-default-admin-delay"
---

Schedule a change of the delay applied to future default admin transfers.

## Syntax

```evml
acl:change-default-admin-delay <contract> <delay>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | AccessControlDefaultAdminRules contract address |
| `delay` | `number` | New delay in seconds |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

# Move to a 5-day delay for future admin transfers
acl:change-default-admin-delay $token 432000
```

## Notes

- The change itself is delayed: increases wait for the new delay, decreases
  wait for the difference. A scheduled change can be undone with
  [acl:rollback-default-admin-delay](rollback-default-admin-delay.md).

## See Also

- [@acl:defaultAdminDelay](../helpers/defaultAdminDelay.md)
