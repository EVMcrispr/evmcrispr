---
title: "safe:propose"
---

Queue a Safe transaction, rejection or Safe message on the Safe Transaction Service: a command block, cancel or a message, signed by the wallet as an owner (its confirmation) or a delegate, or signed JSON.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

Accepts ordinary `(...)` and smart `!(...)` payload blocks. Smart blocks support explicit `@helper!` expressions and returned-value captures.

## Syntax

```evml
safe:propose <safe> <proposal>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `safe` | `address` | Build time | Safe address |
| `proposal` | `block \| string` | Build time | Commands composing the transaction, `cancel` (with --nonce) to reject a pending one, a message (text or EIP-712 typed data), or signed Safe transaction or Safe message JSON |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--salt` | `bytes32` | Build time | Smart-batch storage salt for reproducible offline signing (block forms with !) |
| `--nonce` | `number` | Build time | Safe nonce for a command block (defaults to the next free service nonce), or of the pending transaction to cancel |
| `--origin` | `string` | Build time | Origin tag shown in the Safe UI |
| `--via` | `address` | Build time | Owner Safe to sign through, when you own several owner Safes |
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

Queues a new Safe transaction or Safe message on the Safe Transaction Service
so the other owners can confirm it, here with [safe:confirm](confirm.md) or
in the Safe web app. The service needs a signature, so the connected wallet
signs it, and it is reviewed like [safe:confirm](confirm.md) before the
wallet prompt: a blocking finding refuses it until the matching `--allow-*`
option names what you reviewed.

- As an owner, directly or through an owner Safe it completes alone (`--via`
  picks among several), its signature is the proposal's first confirmation.
- As a delegate, added by an owner with [safe:delegate](delegate.md), it
  signs a transaction as the proposer: the Safe web app shows it, but the
  service never counts it as a confirmation. A delegate cannot propose a
  Safe message.

On a 1-of-1 Safe, an owner's proposal is already fully confirmed, so its
[safe:execute](execute.md) is not reviewed again; `safe:execute` with the
block proposes, confirms and executes in one step.

The Safe commands are named after where their result goes: the Safe
Transaction Service (`propose`, `confirm`), a variable holding JSON
(`propose-offline`, `confirm-offline`), or the chain (`confirm-onchain`,
`execute`). See the [Safe guide](/guides/safe/) for the complete flows.

## Examples

Propose a token transfer:

```evml
load safe

set $receiver 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
safe:propose @ens(mysafe.eth) (
  exec @token(DAI) transfer(address,uint256) $receiver 100e18
)
```

Batch several actions into one proposal (packed through MultiSendCallOnly) and
manage the Safe itself from inside the block:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

safe:propose $mySafe (
  exec @token(DAI) approve(address,uint256) $spender 100e18
  safe:add-owner 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 --threshold 2
) --origin "My app"
```

The nonce of a block defaults to the next free nonce: the on-chain nonce,
skipping past trusted queued proposals. A consumed nonce is refused, and an
proposal over transactions already queued at an explicit `--nonce`
needs `--allow-competing true`, since only one of them can execute.

## Cancel a pending transaction

`cancel` in place of the block proposes a rejection: a zero-value call from
the Safe to itself at the pending transaction's nonce, which is how the Safe
web app rejects one. Once it is confirmed and executed, the pending
transaction can never run.

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose $mySafe cancel --nonce 42
```

`--nonce` is required. A quoted `"cancel"` is a text message instead.

## Messages

A quoted string proposes an off-chain Safe message (EIP-191 text), and EIP-712
typed-data JSON proposes a typed message. Owners confirm it with
`safe:confirm <safe> <safeMessageHash> --message`, and
[@safe:signature](../helpers/signature.md) returns the signature a dapp asks
for:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose $mySafe "I agree to the terms"
```

## Posting signed JSON

Safe transaction or Safe message JSON signed with
[safe:confirm-offline](confirm-offline.md) is posted as it is: its first owner
signature proposes it and the rest become confirmations, so any account can
post it without a wallet prompt. Posting adds no signature: its signers were
reviewed by [safe:confirm-offline](confirm-offline.md) when they signed.

```evml novalidate
safe:propose $mySafe $tx
```

Owner Safe signatures are posted once complete; those still collecting are
kept out with a warning, and [safe:confirm-offline](confirm-offline.md)
continues them in the JSON.

Set `$safe:apiKey` to lift the anonymous rate limits of the Safe Transaction
Service, or `$safe:serviceUrl` to target a self-hosted service.
