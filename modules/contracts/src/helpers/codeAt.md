---
title: "@contracts:codeAt"
---

Return the deployed bytecode at an address.

**Returns**: `bytes`

## Syntax

```evml
@contracts:codeAt(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Contract or account address |

<!-- HAND-WRITTEN -->

## See Also

- [@contracts:storageAt](storageAt.md) — read a storage slot
- [sim:set-code](../../../sim/src/commands/set-code.md) — override bytecode in simulation
