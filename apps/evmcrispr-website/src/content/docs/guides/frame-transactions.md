---
title: Frame Transactions
experimental: true
---

An EIP-8141 *frame transaction* is a transaction made of several calls, called
frames, each with its own caller, gas limits and result. It is the protocol's
native form of what EVMcrispr does with `batch`: one signed unit carrying many
steps, with validation and payment as part of the transaction itself. The
`frames` module writes one from a block and sends it to the ERC-8421
*alternative mempool*, today a public devnet (chain 1337).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com)
and the dev terminal, not on evmcrispr.com.

:::caution
A browser wallet cannot sign a type `0x06` transaction, and the terminal holds
no keys. So a frame transaction is sent from the terminal **from a smart
account** that your wallet authorizes with typed data (see
[From a smart account](#from-a-smart-account)). A `frames:tx` from a plain
address stops with an error. Chain 1337 is the only chain that sends frame
transactions, and it is a devnet that can be reset at any time.
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

`--mempool alt|canonical` picks where the transaction goes: `alt` (the
default) is the alternative mempool, the one the devnet exercises; `canonical`
sends the raw bytes to the node's public mempool, which admits a frame
transaction only under EIP-8141's strict rules.

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
- **Execution gas** of a call frame is the `--gas` of its `exec` or `send`.
- **State gas** of every call frame is `frames:tx --state-gas <n>`. Unused state
  gas is refunded, so a generous value costs only the reservation.

```evml
load frames [tx]

tx --state-gas 200000 (
  exec 0x0000000000000000000000000000000000000001 "f()" --gas 100000
)
```

Nothing sizes the call frames for you: every call needs its `--gas`, and the
`frames:tx` its `--state-gas`. A missing one stops the run before anything is
signed, naming the first frame that lacks it.

### After admission

When the alt mempool admits the transaction, the run prints its hash. It then
waits up to two minutes for the receipt and prints each frame's status and the
payer. If the transaction is not mined by then, the run stops with the mempool's
status and a link to the explorer (`https://explorer.altmempool.wtf`): a pending
frame transaction holds the sender's nonce, so a later transaction from the same
sender would collide with it.

## From a smart account

A wallet cannot sign a frame transaction, but it can sign typed data. The
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

### What the wallet shows

MetaMask shows one signature request, "EVMcrispr Frame Account": typed data
`FrameTransaction` with a single field, `sigHash`, the hash of the frame
transaction, under the account's address and chain 1337. It cannot show the
frames themselves, so the terminal's review lists them before you are asked:
every frame's mode, approval scope, target, value, limits and call, the account,
who pays, and the shape of the typed data the owner signs (its domain and its
one field). The review does not show the nonce, the fees, the cost or the hash:
they are read from the gateway when the transaction is sent. The fees, and the
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
every call needs its own `--gas` and the `frames:tx` needs `--state-gas`, as in
the example (a missing one stops the run before anything is signed). The fees are
the gateway's; a fee above 10 gwei per gas is refused before the wallet is asked.

### The MetaMask network

Chain 1337 is also the id of local development nodes. The terminal adds the
alt-mempool gateway as chain 1337 to MetaMask when it is missing, and refuses to
continue if MetaMask already has a chain 1337 that is another network, rather
than sign for it. Set that network's RPC to
`https://altmempoolgateway.forshtat.com/rpc` (or remove the network, and the
terminal adds the gateway) and run the script again. The terminal only offers
chain 1337 when experimental features are on.

## Limits

- The sender is a frame account, sent from the terminal. A plain address is
  refused, the CLI cannot send frame transactions, and `sim:fork` refuses
  them: no simulation backend runs EIP-8141 frames yet.
- A frame account has one owner and no recovery or rotation.
- One typed-data signature by the account's owner. Not covered: P256 or arbitrary
  signatures, paymaster signatures, keyed nonces other than key 0, recent roots,
  `deploy` frames and `--expires`.
- Frame transactions are sent on chain 1337, the alt-mempool devnet, only; any
  other chain is refused by name. Accounts and sponsors can also be made on the
  local mining devnet, `framesMining` (`bun scripts/frame-devnet.ts up mining`
  in the repository). The quick devnet, `framesQuick`, never mines: it is for
  reads and simulation, and the commands that send refuse it.

## Combining with

- [Simulation](/guides/simulation): `sim:fork` refuses a frame transaction;
  simulate the ordinary calls it wraps first, then send the frames.
- [Smart Batches](/guides/smart-batches): a smart batch is EVMcrispr's
  equivalent on contract-based accounts, and `frames:tx` cannot be nested in one.
- [Operating a Safe](/guides/safe): a Safe collects many owners' approvals for
  one execution, where a frame transaction collects verify frames for one.
