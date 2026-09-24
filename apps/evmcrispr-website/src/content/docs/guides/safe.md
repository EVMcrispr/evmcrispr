---
title: Operating a Safe
description: Propose, confirm, verify and execute Safe transactions and messages through the Safe Transaction Service or on-chain, including owner Safes, cancellations, upgrades, guards and TWAP orders.
experimental: true
---

The `safe` module turns any EVMcrispr block into a Safe transaction. Commands
inside the block run **as the Safe**: `@sender` is the Safe, while `@me` stays
your connected owner wallet. This guide hands transactions to the Safe
Transaction Service, where the other owners confirm them here or in the Safe
web app, or sends them straight to the chain. To exchange signed Safe
transaction JSON without the service, see
[Offline Safe transactions](/guides/offline-safe/).

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

| Step | To the Safe Transaction Service | On-chain |
|---|---|---|
| Propose | `safe:propose` | |
| Confirm | `safe:confirm` | `safe:confirm-onchain` |
| Execute | | `safe:execute` |

The argument is a command block for a new transaction, `cancel` for a
rejection, a quoted string for a message, or a nonce or 32-byte hash for
something queued on the service (`--message` when the hash is a
safeMessageHash). There is no separate review step: every command that signs
or sends something someone else authored, and every command whose signature
is the one that authorizes a transaction,
[reviews it first](#what-evmcrispr-checks-before-you-sign) and refuses it on
a blocking finding. To see the same review without signing, use the
[`@safe:verify`](/reference/safe/helpers/verify/) helper. Propose and confirm
also have an `-offline` form that puts Safe transaction JSON in a variable
instead; those are covered in
[Offline Safe transactions](/guides/offline-safe/).

## User flows

Pick the row that matches how your owners work. Each flow links to the
section that walks through it, and they can be mixed: a transaction proposed
on the service can be confirmed on-chain, or
[exported as JSON](/guides/offline-safe/#move-between-the-service-and-json).

| # | Flow | Commands | Section |
|---|---|---|---|
| 1 | Solo, or the executor plus on-chain confirmations meet the threshold | `execute <block>` | [Execute directly](#execute-directly-from-a-safe) |
| 2 | Team on the Safe Transaction Service | `propose <block>` → `confirm <hash>` → `execute <hash>` | [Transaction Service](#work-with-the-safe-transaction-service) |
| 3 | On-chain confirmations of a queued transaction | `confirm-onchain <hash>` (each owner) → `execute <hash>` | [Confirm on-chain](#confirm-on-chain-instead-of-signing) |
| 4 | A Safe that owns another Safe | The same commands as a direct owner | [Nested Safes](#nested-safes) |
| 5 | Signing a message on the service | `propose "text"` → `confirm <hash> --message true` → `@safe:signature` | [Sign messages](#sign-messages) |
| 6 | Cancelling a pending transaction | `execute cancel` alone, or `propose cancel --nonce <n>` then flow 2 or 3 | [Cancel](#cancel-a-pending-transaction) |
| 7 | Review without signing | `@safe:verify(<nonce \| hash>)` | [Checks before you sign](#what-evmcrispr-checks-before-you-sign) |

Every command in the table takes the Safe as its first argument
(`safe:confirm $safe $safeTxHash`), which the table leaves out. Configuring
the Safe itself, such as [upgrading it](#upgrade-a-safe) or
[setting a guard](#set-a-guard), is a transaction of the Safe, so it goes
through whichever flow your owners use.

## Execute directly from a Safe

When the Safe needs a single signature and the connected wallet is an owner,
[`safe:execute`](/reference/safe/commands/execute/) sends the block straight
to the chain. No queue or off-chain signature is involved. The same works on
a multisig once enough owners have [confirmed on-chain](#confirm-on-chain-instead-of-signing),
since an owner who executes counts as a confirmation:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $receiver 0x2222222222222222222222222222222222222222

safe:execute $safe (
  exec @token(DAI) "transfer(address,uint256)" $receiver 100e18
  safe:add-owner 0x3333333333333333333333333333333333333333 --threshold 2
) --allow-new-owners 0x3333333333333333333333333333333333333333 --allow-change-threshold-to 2
```

Your approval is what authorizes it, so the block is
[reviewed](#what-evmcrispr-checks-before-you-sign) before it is sent, and its
owner and threshold changes need the options that name them.

Several commands are packed into one MultiSend call, so they succeed or
revert together. Safe management commands such as `add-owner`,
`remove-owner`, `change-threshold`, and `enable-module` work unprefixed inside
the block, next to ordinary `exec` calls and commands from other modules.

## Work with the Safe Transaction Service

For a Safe that needs more than one signature,
[`safe:propose`](/reference/safe/commands/propose/) queues the transaction on
the Safe Transaction Service, signed by your wallet as its first
confirmation. It appears in the Safe web app, where owners can confirm it:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $spender 0x2222222222222222222222222222222222222222

safe:propose $safe (
  exec @token(DAI) "approve(address,uint256)" $spender 1000e18
  safe:change-threshold 3
) --origin "Raise threshold and approve spender" --allow-change-threshold-to 3
```

The connected account must be an owner or a delegate of the Safe:

- **An owner** signs it, and the service records the signature as the
  first confirmation.
- **A delegate** signs it as the proposer. The Safe web app shows it, but
  the service never counts a delegate's signature as a confirmation.

Either way the proposal is [reviewed](#what-evmcrispr-checks-before-you-sign)
before the wallet prompt, so changes to the Safe need the matching
`--allow-*` options.

An owner adds a delegate, another account than the owners, with
[`safe:delegate`](/reference/safe/commands/delegate/) (optionally until
`--expires`), and removes it with
[`safe:undelegate`](/reference/safe/commands/undelegate/);
[`@safe:delegates`](/reference/safe/helpers/delegates/) lists them:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $bot 0x4444444444444444444444444444444444444444
safe:delegate $safe $bot --label bot --expires @date(now +30d)
```

The nonce defaults to the next free nonce in the service queue; use `--nonce`
to replace a pending proposal, since only one transaction per nonce can
execute. Only **trusted** proposals count, since anyone can push an unsigned
transaction to a Safe's queue.

Other owners confirm it here or in the Safe web app. The transaction is
named by its **safeTxHash**, printed by `safe:propose` and shown in the Safe
app. It is not an Ethereum transaction hash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $safeTxHash 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

safe:confirm $safe $safeTxHash
```

Before your wallet prompts, `safe:confirm` prints the hashes your device
will show and refuses the transaction if it finds anything risky; see
[what EVMcrispr checks before you sign](#what-evmcrispr-checks-before-you-sign).

Once it has enough confirmations, anyone executes it. An owner who executes
supplies the last missing confirmation by sending it:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:execute $safe 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Execution checks the chain, Safe, hash, current nonce, owner membership, and
threshold again, and fails on `ExecutionFailure` even when the outer
transaction succeeds. It can still fail for insufficient funds, a guard, or
the underlying call.

No API key is needed for normal use. Anonymous clients get a few requests per
second, and each command makes only a handful of requests. For heavier
automation, `set $safe:apiKey <key>` raises the limit. `set $safe:serviceUrl
<url>` targets a self-hosted service, but self-hosted instances can lag
behind the official one, so prefer the default when you can.

## What EVMcrispr checks before you sign

A hardware wallet cannot show what a Safe transaction does. It shows the
EIP-712 **domain hash** and **message hash**, and some models also show the
final **safeTxHash**. Signing blindly means trusting whatever the Safe web
app and the Transaction Service sent to your device.

Every command that confirms a transaction reviews it before your wallet
prompts: `safe:confirm`, `safe:confirm-onchain` and `safe:confirm-offline`,
`safe:propose` (as an owner or a delegate), and `safe:execute` when your own
approval as the executing owner is one of the signatures it counts, whoever
wrote the transaction. Executing a transaction that is already fully signed
adds no authority, so it is not reviewed again. The review is a port of
[safe-tx-hashes-util](https://github.com/pcaversaccio/safe-tx-hashes-util):

1. A transaction fetched from the service is rebuilt from its raw fields and
   refused unless it hashes back to the requested safeTxHash, so a
   compromised service cannot swap what you sign.
2. The domain hash, message hash and safeTxHash are recomputed locally and
   printed. Compare each one with what your wallet displays **before**
   confirming on the device, and reject the signature if any differs.
3. Every call is checked, including each call inside a MultiSend, and the
   findings are printed under the hashes.

A **blocking** finding refuses the command. An option lifts it once you have
checked that the transaction really should do this. A change that hands
power to someone must name the addresses, or the threshold, you reviewed.
The transaction is refused when it does anything else, including a change
made after your review.

| Finding | Option |
|---|---|
| A delegatecall to anything other than MultiSendCallOnly, SafeMigration or SignMessageLib. A delegatecall runs its code as the Safe and can take it over. MultiSend and the ERC-8211 executor that runs smart blocks `!(...)` are trusted only while every call they make is decoded and passes these checks. | `--allow-delegate-call-to <address \| [addresses]>` |
| Owners added | `--allow-new-owners <address \| [addresses]>` |
| Owners removed | `--allow-removed-owners <address \| [addresses]>` |
| A new threshold | `--allow-change-threshold-to <number>` |
| Modules enabled. A module can move anything without owner signatures. | `--allow-new-modules <address \| [addresses]>` |
| A new transaction guard | `--allow-guard-to <address \| none>` |
| A new module guard | `--allow-module-guard-to <address \| none>` |
| A new fallback handler. It answers calls the Safe does not implement, including signature checks. | `--allow-fallback-handler-to <address \| none>` |
| A gas refund: a non-zero gas price, a custom gas token or a custom refund receiver, which pay the executor out of the Safe | `--allow-gas-refund true` |
| Other trusted transactions queued at the same nonce on the service, since only one of them can ever execute. A rejection is expected to compete, so it is not blocked. | `--allow-competing true` |

Owners, threshold, guards and the fallback handler are judged by what the
transaction leaves them as, compared with the Safe now. Setting the current
threshold again needs no option, and neither does an owner added and removed
in the same batch. Adding an owner at the current threshold needs only
`--allow-new-owners`. `none` stands for the zero address, which removes a
guard or handler. Addresses you list that the transaction does not touch are
ignored.

You do not have to work the options out. The error lists every blocking
finding and ends with the options to paste:

```text
safe:confirm refused:
- calls[0]: adds owner 0x3333333333333333333333333333333333333333
- calls[0]: changes the threshold from 2 to 3 (of 3 owners)
Review it with @safe:verify; if intended, pass --allow-new-owners 0x3333333333333333333333333333333333333333 --allow-change-threshold-to 3
```

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $newOwner 0x3333333333333333333333333333333333333333
safe:confirm $safe 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --allow-new-owners $newOwner --allow-change-threshold-to 3
```

A transaction whose nonce is already used can never execute, and is refused
with no option to lift it. Other findings are notices that do not stop the
command: an upgrade through SafeMigration, a module disabled, a nonce ahead
of the on-chain nonce, calldata that could not be decoded, and signatures
that are invalid or not from an owner. On a 1-of-1 Safe, pass the options to
whichever command confirms: `safe:propose`, or `safe:execute` with the block,
which proposes, confirms and executes in one step.

Hashes show that the data on the device is the same data that was checked.
They do not show that the data is what you intended. Also review the target
addresses, values and decoded calls. Calldata is decoded only for the Safe's
own management functions, MultiSend and the ERC-8211 executor; there are no
explorer or selector-registry lookups.

A smart block's calls are decoded from the executor's calldata, including
those behind a runtime condition. Values and arguments resolved at execution
time are marked `runtime` in [`@safe:verify`](/reference/safe/helpers/verify/).
The executor stays an untrusted delegatecall when a call cannot be judged
from the calldata: a target resolved at execution time, runtime arguments in
a call to the Safe itself, or other code at the executor's address.

### Review without signing

[`@safe:verify`](/reference/safe/helpers/verify/) runs the same review
without a wallet and returns it as JSON: hashes, decoded calls, findings,
signatures, readiness, and a `verdict` of `pass` or `blocked`, with the
options a signing command would need under `requires`. Use it to inspect a
transaction before anyone signs, or to decode calldata of other contracts
with `abi:`, a JSON object that maps addresses to ABI arrays. Look up a
queued transaction by nonce, or by safeTxHash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
print @safe:verify($safe 42)
```

Several transactions can be queued at one nonce. A nonce with several queued
transactions is an error that lists them, and a safeTxHash report lists the
others under `competing`.

## Confirm on-chain instead of signing

Owners can confirm on-chain instead of signing off-chain. Each owner sends
`approveHash` for the queued transaction with
[`safe:confirm-onchain`](/reference/safe/commands/confirm-onchain/), which
checks the hash against the service data first. The Safe records every
confirmation, so the other owners do not need the Safe web app:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:confirm-onchain $safe 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Execution then counts the on-chain confirmations. An owner who executes does
not need to confirm first, because the Safe accepts the sender of
`execTransaction` as that owner's approval. In a two-of-three Safe, one
`safe:confirm-onchain` plus an execution by a second owner is enough.

On-chain confirmations, off-chain signatures, and the executor's own approval
can be mixed in one execution. An on-chain confirmation cannot be withdrawn:
to cancel it, execute a rejection at the same nonce. On-chain confirmations
also work without the service, from Safe transaction JSON; see
[Offline Safe transactions](/guides/offline-safe/#confirm-on-chain-from-json).

## Cancel a pending transaction

A pending transaction is cancelled by executing another one at its nonce.
`cancel` in place of the block creates the rejection the Safe web app uses, a
zero-value call from the Safe to itself:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:propose $safe cancel --nonce 42
```

Confirm and execute the rejection like any other transaction. `safe:execute`
takes `cancel` too: it rejects the transaction pending at the on-chain nonce
(`--nonce` may name it, but only that nonce can execute), with the
confirmations the rejection collected on the service. On a 1-of-1 Safe it
needs nothing else:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:execute $safe cancel
```
 A used nonce
alone does not tell you which of the competing transactions executed.

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
dapp. To collect message signatures without the service, see
[Offline Safe transactions](/guides/offline-safe/#sign-messages-offline).

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
| `safe:confirm-onchain` | The owner Safe sends `approveHash` in one transaction you send. | Refused: use `safe:confirm` to queue it. |
| `safe:propose` | The owner Safe's signature proposes the new item. | Refused: [collect the signatures offline](/guides/offline-safe/#owner-safes) first. |

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
block, `safe:confirm-onchain $safe <safeTxHash>` confirms as that Safe.

## Upgrade a Safe

New Safes from [`safe:new`](/reference/safe/commands/new/) use Safe v1.5.0,
created the way Safe{Wallet} creates them, so the same owners, threshold and
salt give the same address on every chain. An older Safe (v1.3.0 or later)
moves to v1.5.0 with [`safe:upgrade`](/reference/safe/commands/upgrade/), a
delegatecall to Safe's own `SafeMigration` contract. It is a transaction of
the Safe like any other, so it goes through the usual flow:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:propose $safe (
  safe:upgrade
) --origin "Update Safe to v1.5.0"
```

It keeps the Safe's L2 or plain flavour and any custom fallback handler, and
does nothing on a Safe that is already on v1.5.0. SafeMigration can only
move a Safe to the canonical v1.5.0 singleton and fallback handler, which
are fixed when it is deployed. The upgrade is therefore a
[notice](#what-evmcrispr-checks-before-you-sign), and the other owners
confirm it with no option.

## Set a guard

A guard is a contract the Safe calls before and after a transaction, and it
can refuse the transaction. A Safe has two:

- The **transaction guard** checks every transaction the owners execute.
  [`safe:install-scope-guard`](/reference/safe/commands/install-scope-guard/)
  deploys a Zodiac ScopeGuard and sets it in one step.
- The **module guard** (Safe v1.5.0 and later) checks every transaction a
  module executes, such as a Zodiac Roles or Delay module. Before v1.5.0,
  modules bypass guards entirely.

[`safe:set-guard`](/reference/safe/commands/set-guard/) sets the transaction
guard, and `--module true` sets the module guard instead.
[`safe:remove-guard`](/reference/safe/commands/remove-guard/) takes the same
flag. Guard changes are transactions of the Safe, so they go through the
usual flow. On a Safe below v1.5.0, upgrade it in the same transaction:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $moduleGuard 0x4444444444444444444444444444444444444444

safe:propose $safe (
  safe:upgrade
  safe:set-guard $moduleGuard --module true
) --origin "Update Safe to v1.5.0 and guard its modules" --allow-module-guard-to $moduleGuard
```

Before building the transaction, the command checks that the address reports
the matching guard interface, which the Safe would otherwise refuse with
`GS300` or `GS301`. It also refuses `--module` on a Safe below v1.5.0, unless
a `safe:upgrade` earlier in the same block upgrades it first. A guard
deployed earlier in the same block has no code yet, so it is logged and not
checked.

A guard change is a [blocking finding](#what-evmcrispr-checks-before-you-sign):
the proposer and the owners who confirm it pass the guard it sets, here
`--allow-module-guard-to $moduleGuard`, or `--allow-guard-to` for the
transaction guard. The two are separate, so allowing one never allows a
change to the other.

A transaction guard that reverts on everything also blocks the transaction
that would remove it. Test a new guard on a fork with
[`sim:fork`](#combining-with-simulation) before the owners sign.

[`@safe:guard`](/reference/safe/helpers/guard/) reads either guard, and its
`!` form checks it in an on-chain assertion:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
print @safe:guard($safe)
print @safe:guard($safe module:true)
```

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
works with `safe:execute`, and the proposal is reviewed when owners confirm
it, like any other queued transaction (or at once, when your signature alone
authorizes it).

`$order` holds the order hash. Every later command takes it, and it is all
you need to keep: the rest is read back from CoW's order indexer and the
chain. To check progress in another session, set it again and read the order
status:

```evml
load swaps

set $order 0x187b95c91c6d307d05c1860c32116b8859ffb8bc77f670dc6ec0b0454034810e
print @swaps:twapStatus($order)
print @swaps:twapParts($order 0 12)
```

Replace the hash with the one your command printed. The status
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
