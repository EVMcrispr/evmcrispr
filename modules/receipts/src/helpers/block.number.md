---
title: "@receipts:block.number"
---

Number of a sealed block, addressed by number or tag (default: latest, so tags like finalized resolve to their current number).

**On-chain (`@receipts:block.number!`)**: Reads the block being written, and takes no arguments.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.number(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Pin the current finalized block number
set $finalized @receipts:block.number(finalized)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.number!)

With `!` and no arguments the read happens on-chain at assertion time: the number of the block being written.

```evml
load assertions
load receipts

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

assertions:assert @num!($gov::{voteEnd()(uint256)} - @block.number!) > 100
```

## See Also

- [@receipts:block.timestamp!](block.timestamp.md), [assertions:assert-block-number](../../../assertions/src/commands/assert-block-number.md)
