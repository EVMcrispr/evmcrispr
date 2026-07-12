---
title: "@access-control:defaultAdmin"
---

Current default admin of an AccessControlDefaultAdminRules contract.

**Returns**: `address`

## Syntax

```evml
@access-control:defaultAdmin(contract)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | AccessControlDefaultAdminRules contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
print @access-control:defaultAdmin($token)
```

## See Also

- [access-control:begin-default-admin-transfer](../commands/begin-default-admin-transfer.md)
