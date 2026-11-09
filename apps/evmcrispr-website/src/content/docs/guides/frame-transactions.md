---
title: Frame Transactions
experimental: true
---

An EIP-8141 *frame transaction* is a transaction made of several calls, called
frames, each with its own caller, gas limits and result. It is the protocol's
native form of what EVMcrispr does with `batch`: one signed unit carrying many
steps, with validation and payment as part of the transaction itself. The
`frames` module writes one from a block and sends it to the ERC-8421
*alternative mempool*, today a public devnet (chain 1337), or to the
canonical mempool of a local frame devnet.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com)
and the dev terminal, not on evmcrispr.com.

:::caution
From a plain address, your wallet is asked to sign the frame transaction
itself, a type `0x06` transaction, with the standard `eth_signTransaction`.
No browser wallet does that yet (MetaMask refuses with its own error): use the
terminal's test wallet on a local devnet, or send **from a smart account** that your wallet authorizes with typed data
(see [From a smart account](#from-a-smart-account)). Frame transactions are
sent on devnets only: chain 1337, which can be reset at any time, and the
local ones.
:::

## One transaction, several frames

`frames:tx` takes a block and returns a single transaction. Each call in the
block is one frame, in the order written. Nothing inside it is sent on its own.

```evml
load frames [tx]

tx (
  send 0x8943545177806ED17B9F23F0a21ee5948eCaa776 --value 1e9
  exec 0x0000000000000000000000000000000000000001 "approve(address,uint256)" 0x0000000000000000000000000000000000000002 100
)
```

| Written | Frame(s) |
|---|---|
| `exec …`, `send …` | one SENDER frame, called by the transaction's sender. If it fails, the later frames still run. |
| `batch ( … )` | its frames are atomic: all of them succeed or none does |
| `default ( exec … )` | each call is a DEFAULT frame, called by the entry point rather than by you |
| `verify <target> … --approve execution\|payment\|both` | one VERIFY frame |
| no `verify`, no `--paymaster` | a self-verify on the sender, added first |
| `--paymaster <addr>` | an execution-only verify on the sender, then a pay frame on `<addr>` |

The first thing a frame transaction does is validate itself. By default the
sender approves its own transaction with one signature, so you write nothing.
`default` and `verify` are commands of the module: write them `frames:default`
and `frames:verify`, or import them with `load frames [tx verify default]`. They
work only inside `frames:tx`.

## Atomic groups

Frames are independent by default. `batch` makes a group all-or-nothing:

```evml
load frames [tx]

tx (
  exec 0x0000000000000000000000000000000000000001 "f()"
  batch (
    exec 0x0000000000000000000000000000000000000001 "g()"
    exec 0x0000000000000000000000000000000000000002 "h()"
  )
)
```

A `verify` cannot be inside a `batch`.

## Verification and payment

`verify` writes a VERIFY frame: a static call that must itself approve the
transaction. `--approve` says which scope the frame permits (what its flags say,
not something EVMcrispr does). An account can approve the execution, the
payment, or both. A `default` frame right before a `verify` with the same target
is that verify's *pre-verify*.

```evml
load frames [tx verify default]

tx (
  verify @me --approve execution
  default (
    exec 0x0000000000000000000000000000000000000002 "pullFee(address,uint256)" @me 1000000
  )
  verify 0x0000000000000000000000000000000000000002 "verify()" --approve payment
  exec 0x0000000000000000000000000000000000000001 "f()"
)
```

When someone else pays, use the shortcut instead of writing both verifies:

```evml
load frames [tx]

tx --paymaster 0x0000000000000000000000000000000000000002 --paymaster-data 0x1234 (
  exec 0x0000000000000000000000000000000000000001 "f()"
)
```

`--mempool alt|canonical` picks where the transaction goes: `alt` is the
alternative mempool, the one chain 1337 exercises and its default; `canonical`
sends the raw bytes to the node's public mempool, which admits a frame
transaction only under EIP-8141's strict rules, and is the default on the
local devnets, which have no alternative mempool.

The block is checked before anything is signed. The validation prefix must be
one the mempool recognizes (`[self_verify]` or `[only_verify, pay]`, each
verify with at most one pre_verify); verifies come before any call;
`--paymaster` excludes an explicit `verify --approve payment`; a block holds at
most 64 frames; and only plain transaction commands on the current chain and
sender are allowed inside it (no `switch` to another chain, no wallet requests).

## Gas

Every frame has its own limits.

- **Validation frames** (the prefix) are never sized. A `verify` gets the
  builders' defaults unless it has `--gas`: 30,000 when its target is the
  sender, 50,000 otherwise. A `default` frame that is a pre_verify needs its own
  `--gas`.
- **Execution gas** of a call frame is the `--gas` of its `exec` or `send`, else
  `frames:tx --gas <n>`.
- **State gas** of every call frame is `frames:tx --state-gas <n>`, 200,000 when
  it is not given (one new account costs 183,600). Unused state gas is
  refunded, so a generous value costs only the reservation.

```evml
load frames [tx]

tx --state-gas 200000 (
  exec 0x0000000000000000000000000000000000000001 "f()" --gas 100000
)
```

Nothing sizes the call frames for you yet: every call needs its `--gas` (or the
block's). A
missing one stops the run before anything is signed, naming the first frame
that lacks it.

To learn it, simulate the transaction on a fork of its network: the fork runs
the frames and logs, for each call written without `--gas`, the gas it used
and the `--gas` to send it with.

```evml
load sim
load frames [tx]

sim:fork --using ethereumjs --on framesMining (
  tx (
    send 0x8943545177806ED17B9F23F0a21ee5948eCaa776 --value 1e9
  )
)
```

### Fees

The fees are the node's unless the block gives them: `frames:tx
--max-fee-per-gas <wei>` and `--max-priority-fee-per-gas <wei>` are signed as
written. In a fork they are what the payer pays for the frames' gas used, so a
simulation shows who paid and how much; without them the simulated
transaction runs free.

```evml
load sim
load frames [tx new-account]

sim:fork --using revm --on framesMining (
  sim:set-balance @me 1e18
  new-account $account --owner @me
  send $account --value 0.01e18
  tx --account $account --max-fee-per-gas 50e9 (
    send 0x8943545177806ED17B9F23F0a21ee5948eCaa776 --value 1e9 --gas 50000
  )
  sim:expect @bool(@balance(ETH $account) < 0.01e18 - 1e9)
)
```

### After admission

When the mempool admits the transaction, the run prints its hash. It then
waits up to two minutes for the receipt and prints each frame's status and the
payer. If the transaction is not mined by then, the run stops with the mempool's
status and a link to the explorer (`https://explorer.altmempool.wtf`): a pending
frame transaction holds the sender's nonce, so a later transaction from the same
sender would collide with it. The `framesQuick` devnet never mines: there the
run stops waiting once the transaction is admitted, and says so.

## From a plain address

Without `--account`, the transaction's sender is your wallet's address. When
it is sent, the frames, the nonce and the fees go to the wallet in one
`eth_signTransaction` request of type `0x6`, the standard request for any
transaction type, so a wallet that implements EIP-8141 works unchanged. The
transaction the wallet returns is sent only if it is exactly the one asked
for and its signature is your address's; the wallet never chooses the
mempool. A wallet that cannot sign it answers with its own error, and the run
stops there with a hint to use `--account`.

The terminal's **Test wallet** (experimental, in the wallet menu) signs them.
It holds anvil's ten public accounts and serves only chains whose RPC is on
your machine: a local anvil on port 8545 (`switch 31337`) and the frame devnets
`framesQuick` and `framesMining`. Before it signs anything it shows what it
was asked, read from the bytes: for a frame transaction, every frame's mode
and what it means, its approval scope, target, value, decoded call and
limits, then who pays, the nonce, the fees, the most it can cost and the
signature hash. Approve signs; Reject stops the run. Its keys are public, so
it refuses any chain reached over the network, chain 1337 included.

## From a smart account

Most wallets cannot sign a frame transaction, but they can sign typed data. The
module therefore ships a *frame account*: a contract whose validation frame
accepts an EIP-712 signature of its owner. Your wallet signs, the account is the
transaction's sender, and a *sponsor* contract can pay for it. This is how the
terminal sends one, with MetaMask. It is experimental and runs on
[next.evmcrispr.com](https://next.evmcrispr.com) and the dev terminal.

Two commands make the contracts, each with ordinary transactions of its own
signed by the wallet, and bind the address to a variable:

- `frames:new-account <variable> --owner <address> --salt <n>` creates the
  owner's account (default `@me`, salt 0) through the frame account factory.
  Its address follows from the owner and the salt alone, the same on every
  frame chain, and [`@frames:account(owner salt)`](/reference/frames/helpers/account/)
  gives it before the account exists, so it can be funded first. On a chain
  where the account exists, nothing is sent; on one without the factory, the
  factory is deployed first. Accounts made before the factory are devnet
  leftovers: create a new one.
- `frames:new-sponsor <variable> --for <account> --fund <wei>` deploys a sponsor
  that pays for the transactions of that account only, and sends `--fund` wei
  with it to pay with. Its owner (default `@me`) may withdraw.

`frames:tx --account <account>` makes the account the sender. The connected
wallet must be the account's owner; it signs but never sends. With
`--paymaster <sponsor>` the sponsor's validation call is filled in, so no
`--paymaster-data` is needed.

```evml
load frames [tx new-account new-sponsor]
switch 1337

new-account $account --owner @me
send $account --value 0.001e18
new-sponsor $sponsor --for $account --fund 0.05e18

tx --account $account --paymaster $sponsor --state-gas 200000 (
  send 0x8943545177806ED17B9F23F0a21ee5948eCaa776 --value 1e9 --gas 50000
)
```

The three steps run top to bottom: the account and the sponsor are deployed,
then one frame transaction is sent from the account and paid by the sponsor.
The account keeps its own balance for what it sends (the `send $account`), and
pays nothing for gas.

### Smart batches

A frame account is an ERC-7579 account, so a smart batch (`batch !(...)`,
with values read on-chain while it runs) can be one of its frame
transactions. The account calls the composable executor, which calls back the
account's `executeFromExecutor`; the calls are one atomic group. The account
installs the executor once, in a frame transaction of its own, and the batch's
calls take the block's `--gas`:

```evml
load frames [tx new-account]
switch 1337

new-account $account --owner @me
tx --account $account --gas 200000 (
  exec $account "installModule(uint256,address,bytes)" 2 0x0000821108B5C9F3fe17E40811bE5b66DaF8f0e7 @bytes("" utf8)
)
tx --account $account --gas 300000 (
  batch !(
    send 0x8943545177806ED17B9F23F0a21ee5948eCaa776 --value 1e9
  )
)
```

The executor must be deployed on the chain (it is checked by its code before
anything is signed). A value a call in the batch captures (`-> [...]`) can
be passed to a later call in it, as in any smart batch. A plain sender cannot
run one: the route needs the account.

### What the wallet shows

MetaMask shows one signature request, "EVMcrispr Frame Account": typed data
`FrameTransaction` with a single field, `sigHash`, the hash of the frame
transaction, under the account's address and chain 1337. It cannot show the
frames themselves, so the terminal's review lists them before you are asked:
every frame's mode, approval scope, target, value, limits and call, the account,
who pays, and the shape of the typed data the owner signs (its domain and its
one field). The review does not show the nonce, the fees, the cost or the hash:
they are read from the chain when the transaction is sent. The fees, and the
most the frames' gas can cost at them, appear as a console line just before
MetaMask asks. The transaction signed is exactly the one reviewed; only the
nonce, the fees and the generated validation calls are added.

### The sponsor

A sponsor pays only for its account: asked to approve a transaction from any
other sender, its validation frame reverts and the transaction is invalid. The
account's owner is not enough; the sponsor holds the funds, and its owner can
withdraw what is left.

### Gas

The account's check gets 40,000 execution gas and the sponsor's 50,000; they
used about 15,000 and 10,500. Body frames are never sized for a smart account, so
every call needs its own `--gas`, as in the example (a missing one stops the
run before anything is signed). The fees are the gateway's; a fee above 10 gwei
per gas is refused before the wallet is asked.

### The MetaMask network

Chain 1337 is also the id of local development nodes. The terminal adds the
alt-mempool gateway as chain 1337 to MetaMask when it is missing, and refuses to
continue if MetaMask already has a chain 1337 that is another network, rather
than sign for it. Set that network's RPC to
`https://altmempoolgateway.forshtat.com/rpc` (or remove the network, and the
terminal adds the gateway) and run the script again. The terminal only offers
chain 1337 when experimental features are on.

## Limits

- The sender is a frame account, or a plain address whose wallet signs type
  `0x06` transactions. The `frames` module sends wherever the script runs:
  from the terminal with your browser wallet, or from the CLI with
  `--wallet-rpc`.
- A frame account has one owner and no recovery or rotation.
- One signature: the sender's own (secp256k1), or the account owner's typed
  data. Not covered: P256 or arbitrary signatures, paymaster signatures, keyed
  nonces other than key 0, recent roots, `deploy` frames and `--expires`.
- Frame transactions are sent on chain 1337, the alt-mempool devnet, and on the
  local devnets `framesQuick` and `framesMining` (`bun scripts/frame-devnet.ts
  up quick|mining` in the repository), which have no alt mempool (there
  `--mempool` defaults to `canonical`). Any other chain is refused by name. The quick
  devnet never mines, and admits one transaction per sender until it is
  restarted.

## Combining with

- [Simulation](/guides/simulation): `sim:fork --using ethereumjs` (or `revm`)
  on a fork of a frame network runs a `frames:tx` frame by frame, the
  sender's verify impersonated, and tells you the `--gas` of each call
  written without one. Elsewhere it refuses the transaction rather than
  pretend it ran.
- [Smart Batches](/guides/smart-batches): a smart batch is EVMcrispr's
  equivalent on contract-based accounts, and `frames:tx` cannot be nested in one.
- [Operating a Safe](/guides/safe): a Safe collects many owners' approvals for
  one execution, where a frame transaction collects verify frames for one.
