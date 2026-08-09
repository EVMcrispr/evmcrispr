---
title: "@receipts:block.gaslimit"
---

The block gas limit: addressed by number or tag you read a sealed block off-chain (default: latest); as @block.gaslimit! you read the block being written at assertion time.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.gaslimit(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the gas limit of a sealed block
set $limit @receipts:block.gaslimit(46147 mainnet)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.gaslimit!)

With `!` and no arguments the read happens on-chain at assertion time: the gas limit of the block being written.

## See Also
