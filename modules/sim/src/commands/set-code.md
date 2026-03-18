---
title: "sim:set-code"
---

Set the bytecode at an address in a fork simulation.

## Syntax

```evml
sim:set-code <address> <bytecode>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `string` | Contract or account address |
| `bytecode` | `string` | New bytecode to set |

## Examples

```evml
# Replace contract bytecode in a fork
sim:fork --using anvil (
  sim:set-code 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 0x600160005260206000f3
)
```

<!-- HAND-WRITTEN -->

## See Also

- [set-storage-at](set-storage-at.md) — override a storage slot
- [fork](fork.md) — fork the chain
- [@contract.codeAt](../../../std/src/helpers/contract.codeAt.md) — read bytecode
