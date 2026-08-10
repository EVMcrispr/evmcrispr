---
title: "@receipts:block.blobBaseFee"
---

Blob base fee in wei: the live value with no arguments, or the EIP-4844 value of a sealed block computed from its excess blob gas (blocks predating EIP-4844 error).

**On-chain (`@receipts:block.blobBaseFee!`)**: Reads the block being written, and takes no arguments.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.blobBaseFee(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the blob base fee a sealed block charged
set $blobfee @receipts:block.blobBaseFee(19529728 mainnet)
```

<!-- HAND-WRITTEN -->

## Off-chain addressing

The off-chain face has two paths:

- **No block argument**: the live value straight from the node, via the `eth_blobBaseFee` RPC.
- **A block number or tag**: the EIP-4844 value of that sealed block, recomputed from its header as `fake_exponential(MIN_BLOB_BASE_FEE, excessBlobGas, BLOB_BASE_FEE_UPDATE_FRACTION)`, i.e. `fake_exponential(1, excessBlobGas, 3338477)`: an integer-only Taylor expansion of `e**(excessBlobGas / 3338477)` wei. Blocks sealed before EIP-4844 carry no excess blob gas and error clearly.

## On-chain face (@block.blobBaseFee!)

With `!` and no arguments the read happens on-chain at assertion time: the blob base fee of the block being written (the BLOBBASEFEE opcode).

## See Also
