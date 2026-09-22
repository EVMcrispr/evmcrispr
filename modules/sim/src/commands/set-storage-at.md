---
title: "sim:set-storage-at"
---

Set a storage slot value at an address in a fork simulation.

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
sim:set-storage-at <address> <slot> <value>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `address` | `address` | Build time | Contract or account address |
| `slot` | `bytes32` | Build time | Storage slot |
| `value` | `string` | Build time | New 32-byte value |

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
- [@contracts:storageAt](../../../contracts/src/helpers/storageAt.md) — read a storage slot
