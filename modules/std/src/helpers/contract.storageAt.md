---
title: "@contract.storageAt"
---

Read a raw storage slot of a contract.

**Returns**: `bytes32`

## Syntax

```evml
@contract.storageAt(address, slot)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Contract or account address |
| `slot` | `bytes32` | Storage slot index |

## Examples

```evml
# Read storage slot 0
set $val @contract.storageAt(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 0x0000000000000000000000000000000000000000000000000000000000000000)
```

<!-- HAND-WRITTEN -->

## See Also

- [@contract.codeAt](contract.codeAt.md) — read bytecode
- [sim:set-storage-at](../../../sim/src/commands/set-storage-at.md) — override a slot in simulation
