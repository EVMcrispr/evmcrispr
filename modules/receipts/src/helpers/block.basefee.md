---
title: "@receipts:block.basefee"
---

The block base fee in wei: addressed by number or tag you read a sealed block off-chain (default: latest); as @block.basefee! you read the block being written at assertion time, e.g. to gate a batch on fee conditions.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.basefee(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the base fee of a sealed block
set $fee @receipts:block.basefee(19426587 mainnet)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.basefee!)

With `!` and no arguments the read happens on-chain at assertion time: the base fee of the block being written, e.g. to gate a batch on fee conditions.

```evml
load assertions
load receipts

assertions:assert @block.basefee! <= 100e9 "basefee too high"
```

## See Also
