---
title: "@receipts:block.hash"
---

Hash of a sealed block, addressed by number or tag (default: latest).

**On-chain (`@receipts:block.hash!`)**: BLOCKHASH semantics: the block number is required, only the previous 256 blocks are reachable, and anything outside them reads 0.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bytes32`

## Syntax

```evml
@receipts:block.hash(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the hash of any sealed block
set $hash @receipts:block.hash(46147 mainnet)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.hash!)

The two faces deliberately diverge in reach. The off-chain face above reads ANY sealed block: the client fetches the header, so a frontier-era hash is as reachable as yesterday's. The on-chain face executes the BLOCKHASH opcode at assertion time, and BLOCKHASH (unchanged by the BLOBHASH-era opcodes around it) only reaches the previous 256 blocks: it reads 0 for the current block, the future, and anything older than 256 blocks.

With `!` the block number is required (there is no "latest" at assertion time) and composes live:

```evml
load assertions
load receipts

assertions:assert @block.hash!(@block.number! - 1) != 0x0
```

## See Also
