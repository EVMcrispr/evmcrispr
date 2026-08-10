---
title: "@acl:operationId"
---

Operation id of an AccessManager call (hashOperation of caller, target and calldata), for use with @acl:operationSchedule.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bytes32`

## Syntax

```evml
@acl:operationId(manager caller target signature params?)
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
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

set $id @acl:operationId($manager @me $token "setDuration(uint256)" [1y])
print @acl:operationSchedule($manager $id)
```

## See Also

- [@acl:operationSchedule](operationSchedule.md)

## On-chain face (@operationId!)

Read hashOperation(caller, target, data) at assertion time — the
calldata still encodes at composition time.

### Examples

```evml
load assertions
load acl

set $manager 0xa111111111111111111111111111111111111111
set $token 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @operationSchedule!($manager @operationId!($manager @me $token "pause()")) == 0
```
