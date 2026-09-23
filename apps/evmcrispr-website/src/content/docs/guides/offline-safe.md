---
title: Offline Safe Transactions
description: Prepare, sign, merge and execute Safe transactions and messages as JSON, without the Safe Transaction Service, and exchange them through files, the CLI and IPFS.
experimental: true
---

The `-offline` commands of the `safe` module never contact the Safe
Transaction Service. They put **Safe transaction JSON** (or Safe message
JSON) in a variable, and owners exchange it however they like: chat, files,
IPFS, or the CLI's stdin. Nothing about the transaction is stored anywhere
but in that JSON until someone executes it. For the service and the Safe web
app, see [Operating a Safe](/guides/safe/).

"Offline" means without the Safe Transaction Service. RPC access is still
used to read the Safe's owners, threshold, and nonce, and the nonce defaults
to the current on-chain nonce, since pending service proposals are not
consulted. The same EVML runs in the terminal and with
`evmcrispr run workflow.evml`. The Safe module is experimental; the CLI
accepts `--experimental`. All addresses, hashes, and nonces below are
placeholders. Each code block is a separate script, unless stated otherwise.

## The offline commands

| Step | Command | Result |
|---|---|---|
| Propose | [`safe:propose-offline $tx <safe> <block \| cancel \| "message">`](/reference/safe/commands/propose-offline/) | Unsigned JSON in `$tx`. No wallet needed. |
| Review | [`@safe:verify(<safe> $tx)`](/reference/safe/helpers/verify/) | The hashes, decoded calls, authorization and warnings, as JSON. |
| Confirm | [`safe:confirm-offline $tx <safe> <$tx \| safeTxHash>`](/reference/safe/commands/confirm-offline/) | The JSON with your signature added. |
| Combine | [`@safe:merge($a $b …)`](/reference/safe/helpers/merge/) | One JSON with the signatures of copies signed in parallel. |
| Confirm on-chain | [`safe:confirm-onchain <safe> $tx`](/reference/safe/commands/confirm-onchain/) | An `approveHash` transaction; nothing to exchange. |
| Execute | [`safe:execute <safe> $tx`](/reference/safe/commands/execute/) | The transaction, executed. |
| Hand to a dapp | [`@safe:signature(<safe> $msg)`](/reference/safe/helpers/signature/) | The packed owner signatures of a Safe message. |

## User flows

| # | Flow | Commands | Section |
|---|---|---|---|
| 1 | Team exchanging JSON | `propose-offline` → `confirm-offline` (each owner) → `@safe:merge` → `execute $tx` | [Prepare](#prepare-a-safe-transaction), [sign](#review-and-sign), [execute](#combine-and-execute) |
| 2 | On-chain confirmations from JSON | `propose-offline` → `confirm-onchain $tx` (each owner) → `execute $tx` | [Confirm on-chain](#confirm-on-chain-from-json) |
| 3 | Moving between the service and JSON | `propose $tx` (JSON → service), `confirm-offline $tx <hash>` (service → JSON) | [Service and JSON](#move-between-the-service-and-json) |
| 4 | Owner Safes | `confirm-offline`, run by each owner of the owner Safe | [Owner Safes](#owner-safes) |
| 5 | Signing a message for a dapp | `propose-offline $msg "text"` → `confirm-offline $msg $msg` → `@safe:signature` | [Sign messages](#sign-messages-offline) |
| 6 | Cancelling a pending transaction | `propose-offline $r cancel --nonce <n>`, then flow 1 or 2 | [Cancel](#cancel-offline) |
| 7 | Air-gapped review | `@safe:verify($safe $tx no-rpc:true)` | [Review and sign](#review-and-sign) |

## Prepare a Safe transaction

Anyone, including a non-owner without a wallet, can prepare the unsigned
transaction with `safe:propose-offline`:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $receiver 0x2222222222222222222222222222222222222222

safe:propose-offline $tx $safe (
  exec @token(DAI) "transfer(address,uint256)" $receiver 100e18
)
print $tx
```

Share the complete JSON, not the block. Rebuilding a block later can produce
a different transaction if a helper read, such as a balance or nonce, has
changed in the meantime.

### Save it to a file

Only `print` writes to stdout. Status messages and signing hashes go to
stderr, so the printed JSON can be redirected straight into a file. With the
script above saved as `prepare.evml`:

```sh
evmcrispr --experimental run prepare.evml > transaction.json
```

Print only the Safe transaction when exporting a JSON file: several `print`
commands produce consecutive outputs, not a single JSON document. In the
terminal, **Download output** saves the same printed text.

### Load it back

Scripts read input with `@fetch(stdin:)`. EVML cannot read filesystem paths or
`file:` URLs, so the host always supplies the data:

- **CLI:** pipe the file into the command, for example
  `cat transaction.json | evmcrispr --experimental run sign.evml`. Input comes
  from the shell, independently of the script file. `evmcrispr run -` instead
  reads the script itself from stdin, so it cannot also supply data.
- **Terminal:** use **Choose input file** before running. The input stays in
  memory and is not uploaded or saved.
- **Terminal link:** pass URL-encoded text in the `?stdin=` parameter. In a
  hash link, it goes after the script path.

Simulation uses the same supplied input.

## Review and sign

Each owner loads the Safe transaction into `$tx`, reviews it, and adds a
signature with `safe:confirm-offline`. Save this as `sign.evml`:

```evml
load safe
load http [@fetch]

set $safe 0x1111111111111111111111111111111111111111
set $tx @fetch(stdin:)

print @safe:verify($safe $tx)
safe:confirm-offline $tx $safe $tx
print $tx
```

Compare the hashes in the report with what your wallet displays before
confirming on the device; the
[Safe guide](/guides/safe/#check-the-hashes-before-you-sign) explains what
each one means. From the CLI, sign with an external signing provider:

```sh
cat transaction.json | evmcrispr --experimental run sign.evml --wallet-rpc http://127.0.0.1:8545 --account 0x1111111111111111111111111111111111111111 > signed.json
```

Use an account controlled by that wallet endpoint. The terminal uses its
connected wallet instead. RPC reads use the `EVMCRISPR_RPC_URL` and per-chain
settings in the CLI, and the chain configuration in the terminal.

Owners can sign one after another, each passing on the JSON they received
plus their signature, or in parallel from the same unsigned file. For a
strictly air-gapped review, pass `no-rpc:true` to `@safe:verify`. It makes no
network calls; ownership, threshold, and nonce are then reported as
unchecked.

## Combine and execute

Owners who signed in parallel produce separate JSON; merge it with
`@safe:merge`. Once the signatures add up to the threshold, any account
executes it. The shell can assemble the signed files into one JSON array
with `jq`, or you can select an equivalent file in the terminal:

```sh
jq -s . owner-a.json owner-b.json | evmcrispr --experimental run execute.evml
```

```evml
load safe
load http [@fetch]

set $safe 0x1111111111111111111111111111111111111111
set $input @fetch(stdin:)
set $tx @safe:merge(@http:json($input "[0]") @http:json($input "[1]"))

print @http:json(@safe:verify($safe $tx) readiness)
safe:execute $safe $tx
```

`ready` only means that the signatures and the nonce are sufficient. Execution
can still fail for insufficient funds, a guard, or the underlying call.
Execution checks the chain, Safe, hash, current nonce, owner membership, and
threshold again. It sorts and deduplicates signers and fails on
`ExecutionFailure` even when the outer transaction succeeds. An owner who
executes counts as a confirmation, so the JSON can be one signature short
when an owner sends it.

## Confirm on-chain from JSON

Instead of signing, owners can confirm on-chain: each one sends `approveHash`
for the transaction in the JSON with `safe:confirm-onchain`. The Safe records
the confirmation, so the JSON only has to reach whoever executes, and it does
not need to carry any signatures:

```evml novalidate
safe:confirm-onchain $safe $tx
```

```evml novalidate
safe:execute $safe $tx
```

On-chain confirmations and off-chain signatures in the JSON can be mixed in
one execution. An on-chain confirmation cannot be withdrawn: to cancel it,
execute a rejection at the same nonce.

## Move between the service and JSON

Signed JSON can be handed to the Safe web app at any point.
`safe:propose $safe $tx` posts it: its first owner signature proposes it and
the rest become confirmations, with no wallet prompt, so a non-owner can post
owner-signed JSON. In the other direction,
`safe:confirm-offline $tx $safe <safeTxHash>` exports a queued transaction
with its confirmations plus your signature:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:confirm-offline $tx $safe 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
print $tx
```

## Owner Safes

When a Safe owns the Safe you sign for, its owners run the same
`sign.evml` as a direct owner. `safe:confirm-offline` finds how your wallet
owns the Safe, up to three levels deep, and stores your signature under the
owner Safe in the JSON. Each owner of the owner Safe adds theirs, and once
its threshold is met the owner Safe's contract signature is packed into the
transaction's signatures. `--via <ownerSafe>` picks the owner Safe when you
own several at the same depth.

`@safe:verify` shows an owner Safe's progress while its owners sign
(`incomplete`, `1 of 2`). This is also how a proposal from a multisig owner
Safe starts: `safe:propose` refuses one that needs more than your signature,
so collect its signatures here and then post the JSON with
`safe:propose $safe $tx`.

## Sign messages offline

Dapps ask a Safe to sign off-chain messages (EIP-1271), such as a login or an
order. `safe:propose-offline` takes a quoted string (an EIP-191 text message)
or EIP-712 typed-data JSON and returns Safe message JSON. Owners sign it with
`safe:confirm-offline`, like a transaction, and
`@safe:signature` returns the packed signatures to hand to the dapp once the
threshold is met:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:propose-offline $msg $safe "I agree to the terms"
safe:confirm-offline $msg $safe $msg
print @safe:signature($safe $msg)
```

In a Safe with more than one owner, print `$msg` after your signature and
pass it on, as with a transaction; merge copies signed in parallel with
`@safe:merge`.

## Cancel offline

A pending transaction is cancelled by executing another one at its nonce.
`cancel` in place of the block prepares the rejection the Safe web app uses,
a zero-value call from the Safe to itself:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:propose-offline $rejection $safe cancel --nonce 42
print $rejection
```

Sign and execute it like any other Safe transaction. Deleting the JSON of
the original transaction does not cancel it: a Safe transaction stays
executable until its nonce is used, and an on-chain `approveHash` approval
stays in place.

## Drafts and sharing

Drafts are ordinary files. Keep them wherever the owners already exchange
documents, and feed them back in as described in
[Load it back](#load-it-back). To share a Safe transaction by CID, use `@ipfs`
and `@ipfs.get`. Uploading currently uses Pinata and is optional; local files
need no pinning service.
