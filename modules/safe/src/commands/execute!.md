---
title: "safe:execute!"
---

Execute a Safe smart batch with explicit on-chain expressions and typed return capture.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. Safe workflows open their own atomic context; they cannot be nested.

## Syntax

```evml
safe:execute! <safe> <proposal>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `safe` | `address` | Build time | Safe address |
| `proposal` | `block \| bytes32 \| string` | Build time | Commands, the safeTxHash of a queued transaction, or exported transaction JSON with --no-api |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--salt` | `bytes32` | Build time | Smart-batch storage salt for reproducible offline signing (block forms with !) |
| `--no-api` | `bool` | Build time | Execute a block or exported transaction JSON without contacting the Safe Transaction Service |
| `--signatures` | `array` | Build time | EIP-712 owner signatures to add locally (requires --no-api; blocks also require --nonce) |
| `--nonce` | `number` | Build time | Nonce signed for a command block (requires --no-api) |

<!-- HAND-WRITTEN -->

Block forms compile explicit on-chain expressions and static ABI return captures into the existing Safe execution workflow. The Safe is `@sender`; the connected owner wallet remains `@me`. Smart segments are delegatecalled with operation 1 and zero outer value.

Nonce, signatures, imported transactions, offline packages and receipt checks follow `safe:execute`. Use `--salt <bytes32>` on a block to reproduce its output-storage keys for offline signing. The installed Safe Apps SDK cannot submit this delegatecall route; use an owner wallet. See the [smart-batch guide](/guides/smart-batches/).
