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

assertions:assert-codehash 0xAbC... @codehash(0xDeF...) "implementation changed"
```

## See Also
