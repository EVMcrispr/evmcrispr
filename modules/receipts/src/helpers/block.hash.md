---
title: "@receipts:block.hash"
---

The hash of a block: addressed by number or tag you read ANY sealed block off-chain (default: latest); as @block.hash!(n) the read happens at assertion time under BLOCKHASH semantics, so it only reaches the previous 256 blocks and reads 0 outside them (the current block, the future, anything older). Compose the number live, e.g. @block.hash!(@block.number! - 1).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bytes32`

## Syntax

```evml
@receipts:block.hash(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest); with ! a required block number, constant or infix expression |
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
