---
title: "safe:confirm-offline"
---

Sign a Safe transaction or Safe message as an owner, or through an owner Safe, and bind the signed JSON to a variable without posting it to the Safe Transaction Service.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
safe:confirm-offline <variable> <safe> <signable>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable that receives the signed JSON |
| `safe` | `address` | Build time | Safe address |
| `signable` | `bytes32 \| string` | Build time | Safe transaction or Safe message JSON, or the hash of one queued on the service (exported with its confirmations) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--message` | `bool` | Build time | The hash is a safeMessageHash, not a safeTxHash |
| `--via` | `address` | Build time | Owner Safe to sign through, when you own several owner Safes |

<!-- HAND-WRITTEN -->

Adds the connected owner's signature to a Safe transaction or Safe message and
binds the signed JSON to the variable, without posting anything. Pass the JSON
on to the next owner, merge parallel signatures with
[@safe:merge](../helpers/merge.md), and finally
[execute](execute.md) it, or post it to the queue with
[safe:propose](propose.md).

The Safe commands are named after where their result goes: the Safe
Transaction Service (`propose`, `confirm`), a variable holding JSON
(`propose-offline`, `confirm-offline`), or the chain (`confirm-onchain`,
`execute`). See the [Safe guide](/guides/safe/) for the complete flows.

Given a hash instead of JSON, the queued transaction (or, with `--message`,
message) is fetched from the Safe Transaction Service, checked against the
hash, and exported with its owner confirmations plus your signature. That is
how a queued transaction moves to the JSON flow, for example to add contract
signatures the service cannot hold.

The connected account must be a current owner, directly or through owner
Safes, and the Safe must be >=1.3.0.
The hashes are printed before the wallet prompt. Signing needs a real wallet,
so it is refused during simulation.

## Owner Safes

When your wallet owns the Safe through an **owner Safe** — a Safe that is
itself an owner — the command finds it and signs for it, up to three levels
deep. A direct owner is used first; if you own several owner Safes at the
same depth, pick one with `--via <ownerSafe>`.
Your signature is stored under the owner Safe inside the JSON. Each of the
owner Safe's owners runs the same command, and the owner Safe's signature is
complete once its threshold is met; `@safe:verify` shows the progress
(`1 of 2`). The message the owner Safe signs follows the Safe's version:
the hash for Safe >=1.5.0, the EIP-712 preimage below it.

## Examples

```evml novalidate
safe:confirm-offline $tx $mySafe $tx
```

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:confirm-offline $tx $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb
```

This follows the prepare/sign/execute separation in the
[Agglayer Safe multisig tools](https://github.com/agglayer/agglayer-contracts/tree/main/tools/safeMultisig).
