---
title: "@receipts:block.prevrandao"
---

RANDAO mix of a sealed block, as a number, addressed by number or tag (default: latest; pre-merge blocks carry proof-of-work difficulty semantics).

**On-chain (`@receipts:block.prevrandao!`)**: Reads the block being written, and takes no arguments.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:block.prevrandao(block? chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[block]` | `number \| string` | Block number or tag (default: latest) |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the RANDAO mix of a sealed block
set $rand @receipts:block.prevrandao(19426587 mainnet)
```

<!-- HAND-WRITTEN -->

## On-chain face (@block.prevrandao!)

With `!` and no arguments the read happens on-chain at assertion time: the PREVRANDAO value of the block being written.

Off-chain the same value is read from a sealed block header, where post-merge blocks (EIP-4399) carry the previous RANDAO mix in the `mixHash` field. Pre-merge blocks carry proof-of-work semantics there instead, matching how the opcode reinterpreted DIFFICULTY.

## See Also
