---
title: "@acl:defaultAdminDelay"
---

Delay in seconds applied to default admin transfers of an AccessControlDefaultAdminRules contract.

**Returns**: `number`

## Syntax

```evml
@acl:defaultAdminDelay(contract)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | AccessControlDefaultAdminRules contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
print @acl:defaultAdminDelay($token)
```

## See Also

- [acl:change-default-admin-delay](../commands/change-default-admin-delay.md)
