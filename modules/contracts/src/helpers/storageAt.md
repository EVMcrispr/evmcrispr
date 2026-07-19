---
title: "@contracts:storageAt"
---

Read a raw storage slot of a contract.

**Returns**: `bytes32`

## Syntax

```evml
@contracts:storageAt(address slot)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Contract or account address |
| `slot` | `bytes32` | Storage slot index |

<!-- HAND-WRITTEN -->

## See Also

- [@contracts:codeAt](codeAt.md) — read bytecode
- [sim:set-storage-at](../../../sim/src/commands/set-storage-at.md) — override a slot in simulation
