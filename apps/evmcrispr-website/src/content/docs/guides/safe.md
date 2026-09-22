---
title: Operating a Safe
description: Propose, verify, sign and execute Safe multisig transactions, with or without the Safe Transaction Service, including nested Safe owners and TWAP orders.
experimental: true
---

The `safe` module turns any EVMcrispr block into a Safe transaction. Commands
inside the block run **as the Safe**: `@sender` is the Safe, while `@me` stays
your connected owner wallet. You can hand the transaction to the Safe
Transaction Service so the other owners confirm it in the Safe web app, or
exchange signed JSON packages without any Safe infrastructure.

This module is experimental. Use [next.evmcrispr.com](https://next.evmcrispr.com)
or enable experimental modules in your host; the CLI accepts `--experimental`.
All addresses, hashes, and nonces below are placeholders. Replace them with
your deployment's values and select the Safe's chain before running a script.
Only Safe v1.3.0 and later are supported. Each code block is a separate
script, unless stated otherwise.

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

## Propose through the Safe Transaction Service

For a Safe that needs more than one signature,
[`safe:propose`](/reference/safe/commands/propose/) signs the transaction with
your wallet and posts it to the Safe Transaction Service. It then appears in
the Safe web app queue, where the remaining owners review and confirm it:

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
to replace a pending proposal. The service is rate-limited for anonymous
clients: `set $safe:apiKey <key>` lifts the limit, and
`set $safe:serviceUrl <url>` targets a self-hosted service.

Once the transaction has enough confirmations, execute it from any account by
its **safeTxHash**, which is printed by `safe:propose` and shown in the Safe
app. It is not an Ethereum transaction hash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:execute $safe 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

## Check the hashes before you sign

A hardware wallet cannot show what a Safe transaction does. It shows the
EIP-712 **domain hash** and **message hash**, and some models also show the
final **safeTxHash**. Signing blindly means trusting whatever the Safe web
app and the Transaction Service sent to your device.
[`safe:verify`](/reference/safe/commands/verify/) fetches the queued
transaction, recomputes all three hashes locally from its raw fields, and
refuses a transaction whose service-reported hash does not match. It is a
port of [safe-tx-hashes-util](https://github.com/pcaversaccio/safe-tx-hashes-util).

Look up the queued transaction by nonce, or by safeTxHash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:verify $safe 42
```

Compare each printed hash with what your wallet displays **before**
confirming on the device. If any of them differs, reject the signature. The
command also warns about fields that are the usual attack vectors:

- delegatecalls to anything other than the canonical MultiSend contract
- a custom gas token or refund receiver
- a non-zero gas price, which pays the executor out of the Safe

Hashes show that the data on the device is the same data you verified. They
do not show that the data is what you intended. Also review the target
addresses, value, and decoded calls in the output. `safe:propose` logs the same
hashes before it asks your wallet to sign, and `safe:execute` with a
safeTxHash recomputes them and refuses tampered service data.

You can also check a block **before** proposing it, without the service. This
prints the hashes that owners will see for that block at a given nonce:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111

safe:verify $safe (
  safe:change-threshold 3
) --no-api true --nonce 42
```

Off-chain Safe messages, such as EIP-1271 signatures requested by a dapp
through the Safe app, are wrapped before owners sign them.
[`safe:verify-message`](/reference/safe/commands/verify-message/) prints the
raw message hash, the Safe domain hash, and the final SafeMessage hash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:verify-message $safe "I agree to the terms"
```

A JSON document with `types` and `message` fields is hashed as EIP-712 typed
data; any other string is hashed per EIP-191.

## Work without the Safe API

Pass `--no-api true` and no request goes to the Safe Transaction Service.
Transactions become portable JSON **packages** that owners exchange however
they like: chat, files, IPFS, or the CLI's stdin. RPC access is still used
to read the Safe's owners, threshold, and nonce. The nonce defaults to the
current on-chain nonce, since pending service proposals are not consulted.

### Prepare a package

Anyone, including a non-owner without a wallet, can prepare the unsigned
transaction:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $receiver 0x2222222222222222222222222222222222222222

safe:propose $safe (
  exec @token(DAI) "transfer(address,uint256)" $receiver 100e18
) --no-api true --unsigned true --as $tx
print $tx
```

The printed JSON contains the chain id, the Safe, every transaction field,
the safeTxHash, and a `signatures` list. Share the complete package, not the
block. Rebuilding a block later can produce a different transaction if a
helper read, such as a balance or nonce, has changed in the meantime.

### Review and sign

Each owner loads the package into `$tx`, verifies it, and signs. Paste the
JSON as a string, or pipe a file into the CLI and read it with
`@fetch(stdin:)`:

```evml
load safe
load http [@fetch]

set $safe 0x1111111111111111111111111111111111111111
set $tx @fetch(stdin:)

safe:verify $safe $tx --no-api true --as $review
sign $signature --typed @http:json($review typedData)
print @safe:merge($tx $signature)
```

`safe:verify` rejects a package whose fields do not hash to its safeTxHash,
and its report includes the hashes, decoded calls, and warnings from the
previous section. [`@safe:merge`](/reference/safe/helpers/merge/) appends the
signature and returns a new package for the next owner. Owners can also sign in
one step with `safe:propose $safe $tx --no-api true`, which prints the package
with the connected owner's signature added.

Verification never fetches an ABI from an explorer or selector registry.
Calldata is decoded only for MultiSend and for targets you describe with
`--abi`, a JSON object that maps addresses to ABI arrays. Any other calldata is
reported as `unverified`, and a supplied ABI describes the encoding, not what
the contract actually does.

For a strictly air-gapped review, add `--offline true` to `safe:verify`. It
makes no network calls; ownership, threshold, and nonce are then reported as
unchecked.

### Merge and execute

Signed packages can be merged in any order. Once they add up to the
threshold, any account can relay the transaction. This script reads a JSON
array of packages from stdin, for example produced with
`jq -s . owner-a.json owner-b.json`:

```evml
load safe
load http [@fetch]

set $safe 0x1111111111111111111111111111111111111111
set $input @fetch(stdin:)
set $tx @safe:merge(@http:json($input "[0]") @http:json($input "[1]"))

safe:verify $safe $tx --no-api true --as $review
print @http:json($review readiness)
safe:execute $safe $tx --no-api true
```

`ready` only means that the signatures and the nonce are sufficient. Execution
can still fail for insufficient funds, a guard, or the underlying call.
Execution checks the chain, Safe, hash, current nonce, owner membership, and
threshold again. It sorts and deduplicates signers and fails on
`ExecutionFailure` even when the outer transaction succeeds.

If owners signed an identical block at an agreed nonce, you can skip packages
and pass their raw signatures instead:

```evml novalidate
safe:execute $safe (
  safe:change-threshold 3
) --no-api true --nonce 42 --signatures [$signatureA $signatureB]
```

To cancel an unexecuted package, prepare a zero-value transfer to the Safe
itself at the same `--nonce` and collect signatures for it. Only one
transaction per nonce can execute. Old packages are not deleted, and a used
nonce alone does not tell you which of the competing transactions executed.

For exporting packages from the CLI, terminal file input, and IPFS sharing,
see [Safe packages from files](/guides/local-first-safe/).

## Nested Safes

A Safe can be an owner of another Safe. In that case the **owner Safe**
approves the **parent Safe**'s transaction on behalf of its own owners, in one
of two ways:

- **On-chain approval**: the owner Safe executes a transaction that calls
  `approveHash(safeTxHash)` on the parent. This works with the Safe web app
  and with `--no-api` execution.
- **Off-chain signature**: the owner Safe's owners sign a Safe message over
  the parent transaction, and the resulting EIP-1271 contract signature is
  merged into the package. Nothing is sent on-chain until the parent executes.

### With the Safe API

Verify the parent transaction with `--nested-safe`. Besides the parent's
hashes, it prints the hashes of the `approveHash` transaction that the owner
Safe's signers will see on their devices:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $ownerSafe 0x4444444444444444444444444444444444444444

safe:verify $safe 42 --nested-safe $ownerSafe
```

The preview uses the owner Safe's current on-chain nonce. If that Safe has
pending proposals, set `--nested-safe-nonce` to the nonce its approval will
use. Then propose the approval in the owner Safe's own queue, passing the
parent's safeTxHash:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $ownerSafe 0x4444444444444444444444444444444444444444
set $safeTxHash 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

safe:propose $ownerSafe (
  exec $safe "approveHash(bytes32)" $safeTxHash
) --origin "Approve parent Safe transaction"
```

A single call is not wrapped in MultiSend, so the hashes of this proposal
should equal the approval hashes printed by `--nested-safe`. Once the owner
Safe executes it, the Transaction Service records the approval as a
confirmation of the parent transaction. The parent can then be executed by
safeTxHash like any other queued transaction. Safe blocks cannot be nested
inside each other, so the approval is always a separate proposal.

### Without the Safe API

Off-chain, the owner Safe signs the parent's exact **signing bytes**, taken
from the parent's verification report. Its owners sign the resulting message
package, and the signed message is merged into the parent package:

```evml novalidate
load safe
load http

safe:verify $safe $tx --no-api true --as $review
safe:verify-message $ownerSafe @http:json($review signingBytes) --format bytes --offline true --as $messageReview
sign $signature --typed @http:json($messageReview typedData)
set $signedMessage @safe:merge(@http:json($messageReview package) $signature)
set $tx @safe:merge($tx $signedMessage)
```

Collect enough signatures of the owner Safe on the message package before
attaching it. Use `signingBytes` and not the parent's safeTxHash or its hex
text, because they produce a different message. Online verification and
execution check the contract signature through the owner Safe itself.

On-chain approvals also work without the API. When the owner Safe executes
`exec $safe "approveHash(bytes32)" $safeTxHash`, whether through its own
package flow or directly, `safe:execute $safe $tx --no-api true` discovers
the approval on-chain and counts it towards the threshold. An on-chain
approval cannot be withdrawn: deleting a package or draft does not remove it.

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
works with `safe:execute`, and the proposal's hashes can be verified like any
other queued transaction.

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
