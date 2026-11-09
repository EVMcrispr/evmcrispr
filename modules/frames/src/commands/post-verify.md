---
title: "frames:post-verify"
---

Check, after every other frame of a frame transaction, what it did: each assert or exec of the block is a POST_TX frame, and if one fails the transaction's body is reverted. The last statement of `frames:tx`; only on networks that run POST_TX frames (the Hegota devnet).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. A frame transaction is its own transaction; it cannot run inside a smart batch.

## Syntax

```evml
frames:post-verify <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `block` | `block` | Build time | The checks: assert and exec lines only |

<!-- HAND-WRITTEN -->

## How it works

`post-verify` is the last statement of a [frames:tx](tx.md) block. Each line inside it is one POST_TX frame (EIP-7906), run after every other frame of the transaction, as a static call by the entry point. A frame can read what the transaction did: the balances, storage and code it changed and the events it emitted (TXTRACE, EVENTDATACOPY). If one fails, the transaction's body is reverted; the transaction is still mined (status 0), its sender's checks and fee kept, and EVMcrispr names the line of the check that failed.

Only `assert` and `exec` go inside:

- `assert` is checked by EVMcrispr's assertions contract (deployed on the Hegota devnet), on the state the body left.
- `exec` calls an assertion contract of your own, or one of the [hegota demo's](/guides/frame-transactions/#checks-after-everything-post-verify), with the arguments you give it.

It runs only on networks whose client runs POST_TX frames: today the Hegota devnet (`switch hegotaDevnet`). The transaction is sent as written: nothing checks it before it is signed, since a check guards against what happens between signing and inclusion; [sim:fork](../../../sim/src/commands/fork.md) runs the checks if you want to see them first.

```evml
load frames [tx post-verify]
switch hegotaDevnet

tx --gas 300000 (
  send 0x000000000000000000000000000000000000dEaD --value 1
  post-verify (
    assert @balance!(ETH 0x000000000000000000000000000000000000dEaD) >= 1
    exec 0x643DfBbbA8a30f9b2e79c5b0B3589106E2fd8DbF "assertExactBeneficiary(address)" 0x000000000000000000000000000000000000dEaD
  )
)
```
