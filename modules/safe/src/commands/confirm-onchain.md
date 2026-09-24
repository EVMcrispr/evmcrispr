---
title: "safe:confirm-onchain"
---

Confirm a Safe transaction or Safe message on-chain with approveHash, as an owner or through an owner Safe you complete alone, instead of signing it off-chain.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command reads the Safe and the transaction service while building, so it cannot be compiled into an atomic batch.

## Syntax

```evml
safe:confirm-onchain <safe> <target>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `safe` | `address` | Build time | Safe address |
| `target` | `bytes32 \| string` | Build time | safeTxHash of a queued transaction (safeMessageHash with --message), or Safe transaction or Safe message JSON |

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

Sends `approveHash(hash)` to the Safe. The Safe stores the confirmation, and
executions and EIP-1271 checks count it towards the threshold without an
off-chain signature. It costs gas but needs no Safe Transaction Service and no
JSON exchange; the service lists it as a confirmation of queued transactions.
It works for Safe transactions and Safe messages alike.

Before confirming, the command prints its findings, and refuses on
a blocking finding until the matching `--allow-*` option names what you
reviewed, like [safe:confirm](confirm.md). A queued hash is fetched from the
service and must hash back to itself, and other transactions queued at the
same nonce block it unless `--allow-competing` is set. It refuses non-owners
and consumed nonces, and does nothing if the owner already confirmed.

## Owner Safes

When your wallet owns the Safe through an **owner Safe** — a Safe that is
itself an owner — the command finds it and signs for it, up to three levels
deep. A direct owner is used first; if you own several owner Safes at the
same depth, pick one with `--via <ownerSafe>`.
The owner Safe sends `approveHash` in a transaction of its own, which you
send when you complete it alone (its threshold, and those below it, are 1).
When it needs more signatures, queue its confirmation with
[safe:confirm](confirm.md) instead.

Inside another Safe's block, the enclosing Safe is the one confirming.

## Examples

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:confirm-onchain $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb
```

Once enough owners have confirmed, any account runs it with
[safe:execute](execute.md); an owner who executes needs no confirmation of its
own. An on-chain confirmation cannot be withdrawn: to cancel it, execute a
rejection at the same nonce (`safe:propose $mySafe cancel --nonce <n>`).
