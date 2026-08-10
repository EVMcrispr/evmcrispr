---
title: "@contracts:codeAt"
---

Deployed bytecode at an address.

**On-chain (`@contracts:codeAt!`)**: Sees code a batch deployed in an earlier step, and an address that self-destructed or was redeployed, which a build-time read cannot.

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
