---
title: "frame:tx"
---

Send the calls of a block as one EIP-8141 frame transaction: a verify frame first, then one frame per call, `batch` groups atomic. Experimental: the alt-mempool devnet only.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. A frame transaction is its own transaction; it cannot run inside a smart batch.

## Syntax

```evml
frame:tx <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `block` | `block` | Build time | The transaction's frames in order: `exec`, `batch`, `default` and `verify` |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--account` | `address` | Build time | Frame account the wallet signs for: it becomes the sender, and its checks are called |
| `--paymaster` | `address` | Build time | Account that pays for the transaction |
| `--paymaster-data` | `bytes` | Build time | Data of the paymaster's pay frame |
| `--state-gas` | `number` | Build time | State gas limit of every body frame |
| `--mempool` | `string` | Build time | `alt` (default) or `canonical` |

<!-- HAND-WRITTEN -->

## How it works

A frame is one call. The block lists the transaction's frames in order, and `frame:tx` returns one action for the whole transaction; nothing inside the block is sent on its own.

| Written | Frame(s) |
|---|---|
| `exec …` | one SENDER frame: called by the transaction's sender. If it fails the later frames still run. |
| `batch ( … )` | its frames carry the atomic flag except the last: all or nothing |
| `default ( exec … )` | every `exec` inside is a DEFAULT frame: called by the entry point, not by you |
| `verify <target> [<sig> <args…>] --approve execution\|payment\|both` | one VERIFY frame |
| no `verify` and no `--paymaster` | a self-verify on the sender, added first |
| `--paymaster <addr> [--paymaster-data <bytes>]` | an execution-only verify on the sender, then a pay frame on `<addr>` |

Frames come out in the order written; the only ones `frame:tx` adds are the shortcuts' at the start. The validation prefix must be one of the shapes the mempool recognizes (`[self_verify]` or `[only_verify, pay]`, each with an optional pre-verify), and the block is checked before anything is signed. `--state-gas` sets the state gas limit of every body frame.

`--account <account>` sends the transaction from a frame account (see `new-account`) that the connected wallet signs for. Inside the block `@sender` is the account and `@me` stays the wallet. The generated verify frame calls the account's `verify(scope)` (scope 3 when the account pays, 2 with a paymaster; 40,000 gas), and the generated pay frame calls the sponsor's `verify()` (50,000 gas) unless `--paymaster-data` is given. A `verify` written in the block is kept as written.

```evml
load frame [tx]

tx (
  exec 0x0000000000000000000000000000000000000001 "approve(address,uint256)" 0x0000000000000000000000000000000000000002 100
)
```
