---
title: "@codehash"
---

Read the keccak256 code hash of an address.

**Returns**: `bytes32`

## Syntax

```evml
@codehash(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Address to read |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

assertions:assert-codehash 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb @codehash(0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9) "implementation changed"
```

## See Also
