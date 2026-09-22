---
title: "safe:propose!"
---

Propose a Safe smart batch with explicit on-chain expressions and typed return capture.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. Safe workflows open their own atomic context; they cannot be nested.

## Syntax

```evml
safe:propose! <safe> <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `safe` | `address` | Build time | Safe address |
| `block` | `block \| string` | Build time | Commands composing the transaction, or exported transaction JSON with --no-api |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--salt` | `bytes32` | Build time | Smart-batch storage salt for reproducible offline signing (block forms with !) |
| `--as` | `variable` | Build time | Bind the exported package to a variable (requires --no-api) |
| `--no-api` | `bool` | Build time | Export transaction JSON and collect signatures locally without contacting the Safe Transaction Service |
| `--unsigned` | `bool` | Build time | Prepare transaction JSON without a wallet signature (requires --no-api) |
| `--nonce` | `number` | Build time | Safe nonce override for a block (defaults to the next free service nonce, or the on-chain nonce with --no-api) |
| `--origin` | `string` | Build time | Origin tag shown in the Safe UI |

<!-- HAND-WRITTEN -->

Compile a Safe smart block and propose its exact calldata through the existing service or offline package workflow. Use `--no-api true --unsigned true --as $package` for an unsigned offline package. A fixed `--salt <bytes32>` plus the same nonce and inputs reproduces the transaction calldata.

Output captures and runtime expressions resolve when the Safe executes the proposal, not when it is signed. See the [smart-batch guide](/guides/smart-batches/).
