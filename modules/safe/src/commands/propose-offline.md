---
title: "safe:propose-offline"
---

Create an unsigned Safe transaction, rejection or Safe message without the Safe Transaction Service and bind its JSON to a variable, for owners to sign with safe:confirm-offline.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

Accepts ordinary `(...)` and smart `!(...)` payload blocks. Smart blocks support explicit `@helper!` expressions and returned-value captures.

## Syntax

```evml
safe:propose-offline <variable> <safe> <proposal>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable that receives the unsigned JSON |
| `safe` | `address` | Build time | Safe address |
| `proposal` | `block \| string` | Build time | Commands composing the transaction, `cancel` (with --nonce) to reject a pending one, or a message (text or EIP-712 typed data) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--salt` | `bytes32` | Build time | Smart-batch storage salt for reproducible offline signing (block forms with !) |
| `--nonce` | `number` | Build time | Safe nonce for a command block (defaults to the on-chain nonce), or of the pending transaction to cancel |

<!-- HAND-WRITTEN -->

Creates an unsigned Safe transaction or Safe message, binds its JSON to the
variable and prints it, without the Safe Transaction Service. No wallet is
needed, so anyone can prepare it, also during simulation. Owners then sign it
with [safe:confirm-offline](confirm-offline.md).

The Safe commands are named after where their result goes: the Safe
Transaction Service (`propose`, `confirm`), a variable holding JSON
(`propose-offline`, `confirm-offline`), or the chain (`confirm-onchain`,
`execute`). See [Offline Safe transactions](/guides/offline-safe/) for the complete flows.

The JSON contains `chainId`, `safe`, `signatures`, `version: 1` and `kind`,
plus `tx` and `safeTxHash` for a transaction, or `message`, `safeMessageHash`
and the original `content` for a message. Numeric transaction fields are
decimal strings. Share the complete JSON rather than the block: rebuilding a
block later can produce a different transaction if a helper read changed.

## Examples

A transaction, at the current on-chain nonce unless `--nonce` is given:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose-offline $tx $mySafe (
  safe:change-threshold 2
)
```

A rejection of the transaction pending at a nonce:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose-offline $rejection $mySafe cancel --nonce 42
```

A message a dapp asks the Safe to sign:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose-offline $msg $mySafe "I agree to the terms"
```
