---
title: "@receipts:block.timestamp"
---

The block timestamp: the latest block at script build time as @block.timestamp, the block at assertion time as @block.timestamp!.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.timestamp
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions
load receipts

set $vesting 0x0102030405060708090a0b0c0d0e0f1011121314

# Seconds until unlock, computed at assertion time
assertions:assert @num!($vesting::{unlockTime()(uint256)} - @block.timestamp!) > 86400
```

## See Also

- [@receipts:block.number!](block.number.md), [assertions:assert-timestamp](../commands/assert-timestamp.md)
