---
title: "@contract.next"
---

Predict the next contract address deployed by a given account.

**Returns**: `address`

## Syntax

```evml
@contract.next(creator offset?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `creator` | `address` | Deployer address |
| `[offset]` | `number` | Nonce offset from current |

## Examples

```evml
# Predict next contract address
set $next @contract.next(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)
```

<!-- HAND-WRITTEN -->

## See Also

- [@contract.codeAt](contract.codeAt.md) — read deployed bytecode
