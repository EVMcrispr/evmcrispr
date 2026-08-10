---
title: "@receipts:block.coinbase"
---

Fee recipient address of a sealed block, addressed by number or tag (default: latest).

**On-chain (`@receipts:block.coinbase!`)**: Reads the block being written, and takes no arguments.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@receipts:block.coinbase(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the fee recipient of a sealed block
set $proposer @receipts:block.coinbase(46147 mainnet)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.coinbase!)

With `!` and no arguments the read happens on-chain at assertion time: the proposer fee recipient of the block being written.

## See Also
