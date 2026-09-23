---
title: "safe:confirm"
---

Confirm a Safe transaction or Safe message queued on the Safe Transaction Service, as an owner or through an owner Safe.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
safe:confirm <safe> <hash>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `safe` | `address` | Build time | Safe address |
| `hash` | `bytes32` | Build time | safeTxHash, or safeMessageHash with --message |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--message` | `bool` | Build time | The hash is a safeMessageHash, not a safeTxHash |
| `--via` | `address` | Build time | Owner Safe to confirm through, when you own several owner Safes |
| `--allow-delegate-call-to` | `address \| array` | Build time | Contracts the transaction may delegatecall besides MultiSendCallOnly, SafeMigration, SignMessageLib and fully decoded MultiSend or ERC-8211 batches |
| `--allow-new-owners` | `address \| array` | Build time | Owners the transaction may add |
| `--allow-removed-owners` | `address \| array` | Build time | Owners the transaction may remove |
| `--allow-change-threshold-to` | `number` | Build time | Threshold the transaction may leave the Safe with |
| `--allow-new-modules` | `address \| array` | Build time | Modules the transaction may enable |
| `--allow-guard-to` | `address \| string` | Build time | Transaction guard the transaction may leave the Safe with (none removes it) |
| `--allow-module-guard-to` | `address \| string` | Build time | Module guard the transaction may leave the Safe with (none removes it) |
| `--allow-fallback-handler-to` | `address \| string` | Build time | Fallback handler the transaction may leave the Safe with (none removes it) |
| `--allow-gas-refund` | `bool` | Build time | Sign or execute despite a gas refund (gasPrice, gasToken or refundReceiver set) |
| `--allow-competing` | `bool` | Build time | Sign or execute although other transactions are queued at the same nonce |

<!-- HAND-WRITTEN -->

Fetches a transaction or message queued on the Safe Transaction Service,
rebuilds it locally and refuses it unless it hashes back to the requested
hash, so a compromised service cannot make you sign different data. It prints
the hashes and findings, and refuses on a blocking finding (a delegatecall to
an unknown contract, new owners, threshold, modules, guards or fallback
handler, a gas refund, or other transactions queued at the same nonce) until
the matching `--allow-*` option names what you reviewed; the refusal lists
the options to pass. See the [Safe guide](/guides/safe/#what-evmcrispr-checks-before-you-sign).
Then it posts your confirmation. An owner who already confirmed is told so
and nothing is sent.

A 32-byte hash is read as a safeTxHash; pass `--message` for a
safeMessageHash.

## Owner Safes

When your wallet owns the Safe through an **owner Safe** — a Safe that is
itself an owner — the command finds it and signs for it, up to three levels
deep. A direct owner is used first; if you own several owner Safes at the
same depth, pick one with `--via <ownerSafe>`.

- **The owner Safe needs only your signature** (every owner Safe on the way
  has threshold 1): you sign the owner Safe's EIP-1271 message and the
  resulting contract signature is posted as its confirmation. No gas, and it
  counts immediately.
- **The owner Safe needs more signatures:** its on-chain confirmation — an
  `approveHash` of this item — is proposed in the owner Safe's own queue,
  signed by you, the way the Safe web app does it. Once its owners confirm and
  execute it there, it counts for this Safe.

## Examples

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:confirm $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb
```

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:confirm $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb --message true
```

Review first with `print @safe:verify($mySafe <hash>)`
([@safe:verify](../helpers/verify.md)).
