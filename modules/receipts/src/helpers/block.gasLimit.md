---
title: "@receipts:block.gasLimit"
---

Gas limit of a sealed block, addressed by number or tag (default: latest).

**On-chain (`@receipts:block.gasLimit!`)**: Reads the block being written, and takes no arguments.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.gasLimit(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the gas limit of a sealed block
set $limit @receipts:block.gasLimit(46147 mainnet)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.gasLimit!)

With `!` and no arguments the read happens on-chain at assertion time: the gas limit of the block being written.

## See Also
