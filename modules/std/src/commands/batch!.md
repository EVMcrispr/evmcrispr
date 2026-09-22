---
title: "batch!"
---

Execute an atomic smart batch with explicit on-chain values and return capture from a compatible smart account.

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
batch! <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `block` | `block` | Build time | Commands to compile |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--salt` | `bytes32` | Build time | Output-storage salt; reuse only to reproduce the same signed plan |

<!-- HAND-WRITTEN -->

Requires an existing compatible ERC-7579 account with the composability executor installed. This command does not perform EIP-7702 authorization or install account modules. Use `safe:execute!` or `safe:propose!` with an owner wallet for Safe execution.

Ordinary commands keep their names inside the block. Explicit `@helper!` expressions and `-> [$output]` captures resolve on-chain. Captures are typed, block-scoped and limited to static ABI outputs. See the [smart-batch guide](/guides/smart-batches/).
