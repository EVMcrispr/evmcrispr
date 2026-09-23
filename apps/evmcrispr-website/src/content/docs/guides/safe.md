---
title: Operating a Safe
description: Propose, confirm, verify and execute Safe transactions and messages, with or without the Safe Transaction Service, including owner Safes, cancellations and TWAP orders.
experimental: true
---

The `safe` module turns any EVMcrispr block into a Safe transaction. Commands
inside the block run **as the Safe**: `@sender` is the Safe, while `@me` stays
your connected owner wallet. You can hand the transaction to the Safe
Transaction Service so the other owners confirm it in the Safe web app, or
exchange signed Safe transaction JSON without any Safe infrastructure.

This module is experimental. Use [next.evmcrispr.com](https://next.evmcrispr.com)
or enable experimental modules in your host; the CLI accepts `--experimental`.
All addresses, hashes, and nonces below are placeholders. Replace them with
your deployment's values and select the Safe's chain before running a script.
Only Safe v1.3.0 and later are supported. Each code block is a separate
script, unless stated otherwise.

## How the commands are named

Every Safe transaction goes through the same steps: someone **proposes** it,
owners **confirm** it until the threshold is met, and anyone **executes** it.
The command name says where the result goes, and the argument says what it
acts on:

| Step | To the Safe Transaction Service | To a variable (JSON) | On-chain |
|---|---|---|---|
| Propose | `safe:propose` | `safe:propose-offline` | |
| Confirm | `safe:confirm` | `safe:confirm-offline` | `safe:confirm-onchain` |
| Execute | | | `safe:execute` |

The argument is a command block for a new transaction, `cancel` for a
rejection, a quoted string for a message, a nonce or 32-byte hash for
something queued on the service (`--message` when the hash is a
safeMessageHash), or Safe transaction / Safe message JSON. Reviewing sends
nothing, so it is a helper: [`@safe:verify`](/reference/safe/helpers/verify/).

## Execute directly from a threshold-one Safe

When the Safe needs a single signature and the connected wallet is an owner,
[`safe:execute`](/reference/safe/commands/execute/) sends the block straight
to the chain. No queue or off-chain signature is involved:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $receiver 0x2222222222222222222222222222222222222222

safe:execute $safe (
  exec @token(DAI) "transfer(address,uint256)" $receiver 100e18
  safe:add-owner 0x3333333333333333333333333333333333333333 --threshold 2
)
```

Several commands are packed into one MultiSend call, so they succeed or
revert together. Safe management commands such as `add-owner`,
`remove-owner`, `change-threshold`, and `enable-module` work unprefixed inside
the block, next to ordinary `exec` calls and commands from other modules.

## Work with the Safe Transaction Service

For a Safe that needs more than one signature,
[`safe:propose`](/reference/safe/commands/propose/) signs the transaction with
your wallet and queues it on the Safe Transaction Service. It appears in the
Safe web app, where owners can confirm it:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $spender 0x2222222222222222222222222222222222222222

safe:propose $safe (
  exec @token(DAI) "approve(address,uint256)" $spender 1000e18
  safe:change-threshold 3
) --origin "Raise threshold and approve spender"
```

The connected account must be an owner or a registered delegate of the Safe.
The nonce defaults to the next free nonce in the service queue; use `--nonce`
to replace a pending proposal, and the command lists the proposals already
queued at that nonce, since only one of them can execute. Only **trusted**
proposals count: anyone can push a transaction to a Safe's queue, but only
one signed by an owner or delegate is trusted.

Other owners confirm it here or in the Safe web app. The transaction is
named by its **safeTxHash**, printed by `safe:propose` and shown in the Safe
app. It is not an Ethereum transaction hash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $safeTxHash 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

print @safe:verify($safe $safeTxHash)
safe:confirm $safe $safeTxHash
```

Once it has enough confirmations, anyone executes it. An owner who executes
supplies the last missing confirmation by sending it:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:execute $safe 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

No API key is needed for normal use. Anonymous clients get a few requests per
second, and each command makes only a handful of requests. For heavier
automation, `set $safe:apiKey <key>` raises the limit. `set $safe:serviceUrl
<url>` targets a self-hosted service, but self-hosted instances can lag
behind the official one, so prefer the default when you can.

## Check the hashes before you sign

A hardware wallet cannot show what a Safe transaction does. It shows the
EIP-712 **domain hash** and **message hash**, and some models also show the
final **safeTxHash**. Signing blindly means trusting whatever the Safe web
app and the Transaction Service sent to your device.
[`@safe:verify`](/reference/safe/helpers/verify/) fetches the queued
transaction, recomputes all three hashes locally from its raw fields, and
refuses a transaction whose service-reported hash does not match. It is a
port of [safe-tx-hashes-util](https://github.com/pcaversaccio/safe-tx-hashes-util).

Look up the queued transaction by nonce, or by safeTxHash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
print @safe:verify($safe 42)
```

Compare each hash in the report with what your wallet displays **before**
confirming on the device. If any of them differs, reject the signature. The
commands that sign or send (`confirm`, `confirm-offline`, `confirm-onchain`,
`execute`) print the same hashes and warnings before they act.

Several transactions can be queued at one nonce, and only one of them can
ever execute. A nonce with several queued transactions is an error that
lists them, and a safeTxHash report lists the others under `competing`. The
report also warns about fields that are the usual attack vectors:

- delegatecalls to anything other than the canonical MultiSend contract
- a custom gas token or refund receiver
- a non-zero gas price, which pays the executor out of the Safe

Hashes show that the data on the device is the same data you verified. They
do not show that the data is what you intended. Also review the target
addresses, value, and decoded calls in the report. Calldata is decoded only
for MultiSend and for targets you describe with `abi:`, a JSON object that
maps addresses to ABI arrays; there are no explorer or selector-registry
lookups.

## Work without the Safe API

The `-offline` commands never contact the Safe Transaction Service. They put
**Safe transaction JSON** in a variable, and owners exchange it however they
like: chat, files, IPFS, or the CLI's stdin. RPC access is still used to read
the Safe's owners, threshold, and nonce. The nonce defaults to the current
on-chain nonce, since pending service proposals are not consulted.

### Prepare a Safe transaction

Anyone, including a non-owner without a wallet, can prepare the unsigned
transaction with
[`safe:propose-offline`](/reference/safe/commands/propose-offline/):

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

### Review and sign

Each owner loads the Safe transaction into `$tx`, reviews it, and adds a
signature with
[`safe:confirm-offline`](/reference/safe/commands/confirm-offline/):

```evml
load safe
load http [@fetch]

set $safe 0x1111111111111111111111111111111111111111
set $tx @fetch(stdin:)

print @safe:verify($safe $tx)
safe:confirm-offline $tx $safe $tx
print $tx
```

For a strictly air-gapped review, pass `no-rpc:true` to `@safe:verify`. It
makes no network calls; ownership, threshold, and nonce are then reported as
unchecked.

### Merge and execute

Owners who sign in parallel produce separate JSON; merge it with
[`@safe:merge`](/reference/safe/helpers/merge/). Once the signatures add up
to the threshold, any account executes it. This script reads a JSON array of
signed Safe transactions from stdin, for example produced with
`jq -s . owner-a.json owner-b.json`:

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
`ExecutionFailure` even when the outer transaction succeeds.

### Move between the service and JSON

Signed JSON can be handed to the Safe web app at any point:
`safe:propose $safe $tx` posts it, its first owner signature proposing it and
the rest becoming confirmations, with no wallet prompt. In the other
direction, `safe:confirm-offline $tx $safe <safeTxHash>` exports a queued
transaction with its confirmations plus your signature.

## Confirm on-chain instead of signing

Owners can confirm on-chain instead of signing off-chain. Each owner sends
`approveHash` for the transaction with
[`safe:confirm-onchain`](/reference/safe/commands/confirm-onchain/), and then
any account executes it. The Safe records every confirmation, so this needs
no JSON exchange and no Transaction Service, only an RPC node:

```evml novalidate
safe:confirm-onchain $safe $tx
```

It also takes a queued safeTxHash, checked against the service data. Execution
then counts the on-chain confirmations. An owner who executes does not need to
confirm first, because the Safe accepts the sender of `execTransaction` as
that owner's approval. In a two-of-three Safe, one `safe:confirm-onchain` plus
an execution by a second owner is enough:

```evml novalidate
safe:execute $safe $tx
```

On-chain confirmations, off-chain signatures, and the executor's own approval
can be mixed in one execution. An on-chain confirmation cannot be withdrawn:
to cancel it, execute a rejection at the same nonce.

## Cancel a pending transaction

A pending transaction is cancelled by executing another one at its nonce.
`cancel` in place of the block creates the rejection the Safe web app uses, a
zero-value call from the Safe to itself:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:propose $safe cancel --nonce 42
```

Confirm and execute the rejection like any other transaction. Without the
service, `safe:propose-offline $rejection $safe cancel --nonce 42` prepares
it as JSON. Old JSON is not deleted, and a used nonce alone does not tell you
which of the competing transactions executed.

## Sign messages

Dapps ask a Safe to sign off-chain messages (EIP-1271), such as a login or an
order. A quoted string is an EIP-191 text message, and EIP-712 typed-data
JSON is a typed message. On the service, owners confirm it with `--message`,
since a safeMessageHash is otherwise read as a safeTxHash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:propose $safe "I agree to the terms"
```

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $messageHash 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

safe:confirm $safe $messageHash --message true
print @safe:signature($safe $messageHash message:true)
```

[`@safe:signature`](/reference/safe/helpers/signature/) returns the packed
owner signatures once the threshold is met: the signature to hand to the
dapp. Without the service, the same flow uses JSON:

```evml novalidate
safe:propose-offline $msg $safe "I agree to the terms"
safe:confirm-offline $msg $safe $msg
print @safe:signature($safe $msg)
```

For exporting Safe transactions from the CLI, terminal file input, and IPFS
sharing, see [Safe transactions from files](/guides/local-first-safe/).

## Nested Safes

A Safe can be an owner of another Safe. You do not need to do anything
different for it: run the same commands against the Safe you want to act on,
and they find how your wallet owns it — directly, or through an **owner
Safe** that is itself an owner, up to three levels deep. A direct owner is
used first; when you own several owner Safes at the same depth, `--via
<ownerSafe>` picks one.

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:confirm $safe 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

What happens depends on whether your signature completes the owner Safe:

| | Owner Safe needs only you | Owner Safe needs more signatures |
|---|---|---|
| `safe:confirm` | Off-chain: you sign the owner Safe's EIP-1271 message and its contract signature is posted as a confirmation. No gas. | Its on-chain confirmation (`approveHash`) is proposed in the owner Safe's own queue, as in the Safe web app. Its owners confirm and execute it there. |
| `safe:confirm-offline` | Your signature is stored under the owner Safe in the JSON. | Same: each of its owners runs the same command until its threshold is met. |
| `safe:confirm-onchain` | The owner Safe sends `approveHash` in one transaction you send. | Refused: use `safe:confirm` to queue it. |
| `safe:propose` | The owner Safe's signature proposes the new item. | Refused: prepare with `safe:propose-offline` and collect the signatures offline first. |

[`@safe:verify`](/reference/safe/helpers/verify/) shows an owner Safe's
progress while its owners sign (`incomplete`, `1 of 2`), and checks the
finished signature through the owner Safe itself.

What an owner Safe signs follows the version of the Safe it approves for:
Safe >=1.5.0 hands owner Safes the 32-byte hash, older Safes the EIP-712
preimage through the legacy `isValidSignature(bytes,bytes)`. That legacy
check is gone from 1.5.0 fallback handlers, so an owner Safe on 1.5.0 cannot
sign off-chain for a Safe below 1.5.0; confirm on-chain instead.

Safe blocks cannot be nested inside each other, so an owner Safe's on-chain
confirmation is always a transaction of its own. Inside an owner Safe's
block, `safe:confirm-onchain $safe $tx` confirms as that Safe.

## Run a TWAP order from a Safe

The `swaps` module's [`swaps:twap`](/reference/swaps/commands/twap/) splits a
large sell into equal parts executed over time by CoW Protocol. Inside a Safe
block the Safe is the controller, the funder, and the default recipient of
the bought tokens, so a TWAP order becomes one Safe transaction:

```evml
load safe
load swaps

set $safe 0x1111111111111111111111111111111111111111

safe:propose $safe (
  swaps:twap $order 12000e18 @token(DAI) to @token(WETH) --parts 12 --every 3600 --price-protection 1
) --origin "Sell DAI for WETH over 12 hours"
print $order
```

This sells 12,000 DAI in twelve hourly parts. Every part must buy at least
99% of a fresh CoW quote for one part. `--min <total>` sets a fixed total
minimum instead. Parts are fill-or-kill: a part that misses its price limit
or window expires and does not roll over to the next one. The schedule starts
when the Safe transaction is **mined**, not when it is proposed, so a slow
confirmation shifts the whole schedule.

The transaction moves the sell amount into a dedicated 1-of-1 execution Safe
owned by your Safe. It then approves CoW's relayer and registers the
conditional order. CoW's watchtower submits each part when its time comes.
Your Safe's fallback handler and modules are not changed. The same command
works with `safe:execute`, and the proposal can be reviewed with
`@safe:verify` like any other queued transaction.

`$order` is a JSON reference with the chain, controller, execution account,
and order parameters. Save the printed string: every later command needs it.
To check progress, restore it and read the order status:

```evml
load swaps

set $order '{"version":1}'
print @swaps:twapStatus($order)
print @swaps:twapParts($order 0 12)
```

Replace `'{"version":1}'` with the complete printed reference. The status
separates on-chain registration, fills proven by settlement events, and
finality. A successful proposal on its own is not proof that the order was
registered.

To stop an active order, cancel it from the Safe. After the cancellation is
mined, or after the schedule has ended, recover the unsold tokens in a
**separate** transaction:

```evml novalidate
safe:propose $safe (
  swaps:twap-cancel $order
)
```

```evml novalidate
safe:propose $safe (
  swaps:twap-recover $order
)
```

Recovery reads the execution Safe's balance while it builds the transaction.
Do not combine it with a pending cancellation, and rebuild the proposal if it
waits in the queue while fills are still settling.

## Combining with simulation

Rehearse a Safe transaction on a fork before anyone signs it. Inside
[`sim:fork`](/guides/simulation/), impersonate an owner of a threshold-one
Safe and execute the block. TWAP orders need `--offline true` with a fixed
`--min`, because no production CoW API is called on a fork:

```evml
load sim
load safe
load swaps

set $safe 0x1111111111111111111111111111111111111111
set $owner 0x5555555555555555555555555555555555555555

sim:fork --from $owner (
  safe:execute $safe (
    swaps:twap $order 12000e18 @token(DAI) to @token(WETH) --parts 12 --every 3600 --min 3e18 --offline true
  )
  print @swaps:twapStatus($order)
)
```

A successful simulation shows that the registration succeeded and the order is
valid. It does not show that solvers will fill future parts. For multisig
Safes, verify the hashes on each signer's device, as described above; the
simulation does not replace that step.
