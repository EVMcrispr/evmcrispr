---
title: "@access-control:access-control.pendingDefaultAdmin"
---

Pending default admin of an AccessControlDefaultAdminRules contract (the zero address when no transfer is in progress).

**Returns**: `address`

## Syntax

```evml
@access-control:access-control.pendingDefaultAdmin(contract)
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
print @access-control.pendingDefaultAdmin($token)
```

## Notes

- Returns the zero address when no transfer is in progress.

## See Also

- [access-control:accept-default-admin-transfer](../commands/accept-default-admin-transfer.md)
