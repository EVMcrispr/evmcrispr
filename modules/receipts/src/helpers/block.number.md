---
title: "@receipts:block.number"
---

The block number: the latest block at script build time as @block.number, the block at assertion time as @block.number!.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.number
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions
load receipts

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

assertions:assert @num!($gov::{voteEnd()(uint256)} - @block.number!) > 100
```

## See Also

- [@receipts:block.timestamp!](block.timestamp.md), [assertions:assert-block-number](../commands/assert-block-number.md)
