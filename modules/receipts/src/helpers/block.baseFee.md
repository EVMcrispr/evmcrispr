---
title: "@receipts:block.baseFee"
---

Base fee in wei of a sealed block, addressed by number or tag (default: latest).

**On-chain (`@receipts:block.baseFee!`)**: Reads the block being written, and takes no arguments.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.baseFee(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the base fee of a sealed block
set $fee @receipts:block.baseFee(19426587 mainnet)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.baseFee!)

With `!` and no arguments the read happens on-chain at assertion time: the base fee of the block being written, e.g. to gate a batch on fee conditions.

```evml
load receipts

assert @block.baseFee! <= 100e9 "basefee too high"
```

## See Also
