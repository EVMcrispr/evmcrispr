---
title: "@receipts:block.hash!"
---

The hash of a block, read at assertion time (0 for the current block, the future, and blocks older than 256). Compose the number live, e.g. @block.hash!(@block.number! - 1).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bytes32`

## Syntax

```evml
@receipts:block.hash!(...block)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...block]` | `number` | Block number: a constant or an infix expression |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also
