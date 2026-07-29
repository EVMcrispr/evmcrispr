---
title: "@contracts:next"
---

Predict the next contract address deployed by a given account.

**Returns**: `address`

## Syntax

```evml
@contracts:next(creator offset?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `creator` | `address` | Deployer address |
| `[offset]` | `number` | Nonce offset from current |

<!-- HAND-WRITTEN -->

## See Also

- [@contracts:codeAt](codeAt.md) — read deployed bytecode
