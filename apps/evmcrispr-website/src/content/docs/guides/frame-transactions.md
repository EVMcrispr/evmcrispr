---
title: Frame Transactions
experimental: true
---

An EIP-8141 *frame transaction* is a transaction made of several calls, called
frames, each with its own caller, gas limits and result. It is the protocol's
native form of what EVMcrispr does with `batch`: one signed unit carrying many
steps, with validation and payment as part of the transaction itself. The
`frame` module writes one from a block and sends it to the ERC-8421
*alternative mempool*, today a public devnet (chain 1337).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com)
and the dev terminal, not on evmcrispr.com.

:::caution
A browser wallet cannot sign a type `0x06` transaction, and the terminal holds
no keys. So a frame transaction is sent either by the **CLI**, signed by a local
key, or, from the terminal, **from a smart account** that your wallet
authorizes with typed data (see [From a smart account](#from-a-smart-account)).
In the terminal, a `frame:tx` from a plain address stops with an error. Chain
1337 is the only chain that sends frame transactions, and it is a devnet that
can be reset at any time.
:::

## One transaction, several frames

`frame:tx` takes a block and returns a single transaction. Each call in the
block is one frame, in the order written. Nothing inside it is sent on its own.

```evml
load frame [tx]

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
`default` and `verify` are commands of the module: write them `frame:default`
and `frame:verify`, or import them with `load frame [tx verify default]`. They
work only inside `frame:tx`.

## Atomic groups

Frames are independent by default. `batch` makes a group all-or-nothing:

```evml
load frame [tx]

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
load frame [tx verify default]

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
load frame [tx]

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
  Under `--size-by-simulation`, a call frame is re-sized, and its `--gas`
  replaced (the CLI says so), unless `frame:tx` also has `--state-gas`.
- **State gas** of every call frame is `frame:tx --state-gas <n>`. Unused state
  gas is refunded, so a generous value costs only the reservation.

```evml
load frame [tx]

tx --state-gas 200000 (
  exec 0x0000000000000000000000000000000000000001 "f()" --gas 100000
)
```

The local key is an account without code, and the node cannot estimate the
frames of such a sender without a real signature. A call frame without `--gas`,
or a `frame:tx` without `--state-gas`, therefore needs the CLI flag
`--size-by-simulation`. Without it the run stops before signing anything and
names the first frame that lacks limits.

### What `--size-by-simulation` signs

It signs a **provisional** frame transaction: the same frames and nonce as yours,
with generous limits. That transaction is valid as signed, so whoever receives
it could broadcast it. It is sent only to the devnet's ethrex node
(`https://altmempool.forshtat.com`), which simulates it; the CLI sets each limit
from what the simulation used (x1.25 + 5,000 for execution, and 200,000 reserved
for state), then signs the real transaction and sends it to the alt mempool. Like
every signature of the local key, the provisional one is shown and confirmed
first. Use it with a throwaway key.

## Running it from the CLI

The CLI signs with a key from the environment, never from an argument:

```bash
export EVMCRISPR_PRIVATE_KEY=0x...   # a throwaway key, funded on the devnet
export EVMCRISPR_DEFAULT_CHAIN_ID=1337
export EVMCRISPR_RPC_URL_1337=https://altmempoolgateway.forshtat.com/rpc
evmcrispr run frame.evml --experimental --size-by-simulation
```

The script selects the devnet with `switch 1337`. The module declares no chain
of its own, because 1337 is also the id of local development nodes; the CLI's
local key signs on a single chain per run, hence the two variables.

```evml
load frame [tx]

switch 1337
tx (
  send 0x8943545177806ED17B9F23F0a21ee5948eCaa776 --value 1e9
)
```

Before each signature the CLI shows the transaction: the chain, the sender and
payer, the nonce and, for every frame, its mode, approval scope, target, value,
call and limits. In a terminal it then asks y/N. Without a terminal (a pipe, CI)
it signs only with `--yes`, and otherwise stops. The key is never printed, and it
cannot be combined with `--wallet-rpc` or `--account`.

The devnet has a faucet (`requestFaucet` of `@evmcrispr/viem-frames`), which is
how a throwaway key gets gas.

### After admission

When the alt mempool admits the transaction the CLI prints its hash. It then
waits up to two minutes for the receipt and prints each frame's status and the
payer. If the transaction is not mined by then, the run stops with the mempool's
status and a link to the explorer (`https://explorer.altmempool.wtf`): a pending
frame transaction holds the sender's nonce, so a later transaction from the same
key would collide with it. On 2026-11-06 the devnet admitted frame transactions
but bundled none, ours or anyone else's, so a run ended this way.

## From a smart account

A wallet cannot sign a frame transaction, but it can sign typed data. The
module therefore ships a *frame account*: a contract whose validation frame
accepts an EIP-712 signature of its owner. Your wallet signs, the account is the
transaction's sender, and a *sponsor* contract can pay for it. This is how the
terminal sends one, with MetaMask. It is experimental and runs on
[next.evmcrispr.com](https://next.evmcrispr.com) and the dev terminal.

Two commands deploy the contracts, each with an ordinary transaction of its own
signed by the wallet, and bind the new address to a variable:

- `frame:new-account <variable> --owner <address>` deploys an account that
  accepts the signatures of its owner (default `@me`).
- `frame:new-sponsor <variable> --for <account> --fund <wei>` deploys a sponsor
  that pays for the transactions of that account only, and sends `--fund` wei
  with it to pay with. Its owner (default `@me`) may withdraw.

`frame:tx --account <account>` makes the account the sender. The connected
wallet must be the account's owner; it signs but never sends. With
`--paymaster <sponsor>` the sponsor's validation call is filled in, so no
`--paymaster-data` is needed.

```evml
load frame [tx new-account new-sponsor]
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

The CLI shows more before it signs: every frame with its full calldata, one
32-byte word per line, who pays, the nonce, the fees, the most the frames' gas
can cost (the transaction's intrinsic cost comes on top), and the signature
hash. With a local key that is the confirmation you answer; with
`--wallet-rpc` it is printed before the wallet is asked.

### The sponsor

A sponsor pays only for its account: asked to approve a transaction from any
other sender, its validation frame reverts and the transaction is invalid. The
account's owner is not enough; the sponsor holds the funds, and its owner can
withdraw what is left.

### Gas

The account's check gets 40,000 execution gas and the sponsor's 50,000; they
used about 15,000 and 10,500. Body frames are never sized for a smart account, so
every call needs its own `--gas` and the `frame:tx` needs `--state-gas`, as in
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

From the CLI, the same account is available with `--wallet-rpc`, or with a local
key, which signs the typed data itself.

## Limits

- Senders are the CLI's local key and, from the terminal or with
  `--wallet-rpc`, a frame account. The terminal refuses a plain address, and
  `sim:fork` cannot simulate type `0x06`.
- A frame account has one owner and no recovery or rotation.
- One secp256k1 signature of the sender (a frame account uses one typed-data
  signature). Not covered: P256 or arbitrary
  signatures, paymaster signatures, keyed nonces other than key 0, recent roots,
  `deploy` frames and `--expires`.
- Chain 1337, the alt-mempool devnet, only. Any other chain is refused by name.

## Combining with

- [Simulation](/guides/simulation): `sim:fork` cannot run a frame transaction;
  simulate the ordinary calls it wraps first, then send the frames.
- [Smart Batches](/guides/smart-batches): a smart batch is EVMcrispr's
  equivalent on contract-based accounts, and `frame:tx` cannot be nested in one.
- [Operating a Safe](/guides/safe): a Safe collects many owners' approvals for
  one execution, where a frame transaction collects verify frames for one.
