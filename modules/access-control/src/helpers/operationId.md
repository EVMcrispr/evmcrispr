---
title: "@access-control:operationId"
---

Operation id of an AccessManager call (hashOperation of caller, target and calldata), for use with @access-control:operationSchedule.

**Returns**: `bytes32`

## Syntax

```evml
@access-control:operationId(manager caller target signature params?)
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

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

set $id @access-control:operationId($manager @me $token "setDuration(uint256)" [31536000])
print @access-control:operationSchedule($manager $id)
```

## See Also

- [@access-control:operationSchedule](operationSchedule.md)
