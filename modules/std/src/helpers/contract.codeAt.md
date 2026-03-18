---
title: "@contract.codeAt"
---

Return the deployed bytecode at an address.

**Returns**: `bytes`

## Syntax

```evml
@contract.codeAt(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Contract or account address |

## Examples

```evml
# Read contract bytecode
set $code @contract.codeAt(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)
```

<!-- HAND-WRITTEN -->

## See Also

- [@contract.storageAt](contract.storageAt.md) — read a storage slot
- [sim:set-code](../../../sim/src/commands/set-code.md) — override bytecode in simulation
