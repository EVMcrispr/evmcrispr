---
title: "@receipts:block.timestamp"
---

Timestamp of a sealed block, addressed by number or tag (default: latest).

**On-chain (`@receipts:block.timestamp!`)**: Reads the block being written, and takes no arguments.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.timestamp(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the timestamp a sealed block was mined at
set $when @receipts:block.timestamp(19426587 mainnet)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.timestamp!)

With `!` and no arguments the read happens on-chain at assertion time: the timestamp of the block being written.

```evml
load assertions
load receipts

set $vesting 0x0102030405060708090a0b0c0d0e0f1011121314

# Seconds until unlock, computed at assertion time
assertions:assert @num!($vesting::{unlockTime()(uint256)} - @block.timestamp!) > 86400
```

## See Also

- [@receipts:block.number!](block.number.md), [assertions:assert-timestamp](../../../assertions/src/commands/assert-timestamp.md)
