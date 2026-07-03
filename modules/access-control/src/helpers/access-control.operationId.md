---
title: "@access-control:access-control.operationId"
---

Operation id of an AccessManager call (hashOperation of caller, target and calldata), for use with @access-control.operationSchedule.

**Returns**: `bytes32`

## Syntax

```evml
@access-control:access-control.operationId(manager, caller, target, signature, params?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `caller` | `address` | Account that schedules the operation |
| `target` | `address` | Managed contract address |
| `signature` | `string` | Function signature (e.g. mint(address,uint256)) |
| `[params]` | `array` | Arguments matching the signature types |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $id @access-control.operationId($manager @me $token "setDuration(uint256)" [31536000])
print @access-control.operationSchedule($manager $id)
```

## See Also

- [@access-control.operationSchedule](access-control.operationSchedule.md)
