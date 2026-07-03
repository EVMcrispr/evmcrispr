---
title: "@access-control:access-control.defaultAdminDelay"
---

Delay in seconds applied to default admin transfers of an AccessControlDefaultAdminRules contract.

**Returns**: `number`

## Syntax

```evml
@access-control:access-control.defaultAdminDelay(contract)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | AccessControlDefaultAdminRules contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

print @access-control.defaultAdminDelay($token)
```

## See Also

- [access-control:change-default-admin-delay](../commands/change-default-admin-delay.md)
