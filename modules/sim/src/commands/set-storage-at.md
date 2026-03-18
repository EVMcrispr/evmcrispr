---
title: "sim:set-storage-at"
---

Set a storage slot value at an address in a fork simulation.

## Syntax

```evml
sim:set-storage-at <address> <slot> <value>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Contract or account address |
| `slot` | `bytes32` | Storage slot |
| `value` | `string` | New 32-byte value |

## Examples

```evml
# Set a storage slot value in a fork
sim:fork --using anvil (
  sim:set-storage-at 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 0x0000000000000000000000000000000000000000000000000000000000000001 0x00000000000000000000000000000000000000000000000000000000000000ff
)
```

<!-- HAND-WRITTEN -->

## See Also

- [set-code](set-code.md) — override contract bytecode
- [fork](fork.md) — fork the chain
- [@contract.storageAt](../../../std/src/helpers/contract.storageAt.md) — read a storage slot
