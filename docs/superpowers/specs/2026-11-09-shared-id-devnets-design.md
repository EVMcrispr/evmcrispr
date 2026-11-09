# Public frame devnets on shared chain ids

Status: design, 2026-11-09. Asked by the owner after the Hegota devnet was
added by id only (`461bcc04`): "I'm not sure about not declaring the chain
and having to set EVMCRISPR_RPC_URL_<id> instead."

## Intent

The two public frame devnets are reached by name, with nothing to configure:
`switch altMempoolDevnet`, `switch hegotaDevnet`, `sim:fork --on hegotaDevnet`.
Their chain ids are shared with local tooling (1337 is Ganache's, geth
`--dev`'s and viem's `localhost`; 3151908 is Kurtosis' default), so a chain
with one of those ids is the public devnet only when it is that chain: a
local node on the same id is never mistaken for it, and never silently read
from or sent to through the public node.

Local frame devnets: kept as they are, on ids of their own (decided after
considering their removal; see Local devnets).

## The two public devnets

Declared in `modules/frames/src/chains.ts` (experimental, as the module is):

| Key | Id | RPC | Explorer | Client (profile) |
|---|---|---|---|---|
| `altMempoolDevnet` | 1337 | `https://altmempool.forshtat.com/rpc` (sidecar; node `https://altmempool.forshtat.com`) | `https://explorer.altmempool.wtf` | ethrex `eip8141-tracer` (`ethrex-eip8141-tracer`) |
| `hegotaDevnet` | 3151908 | `https://rpc1.hegota.ethrex.xyz` | `https://dora.hegota.ethrex.xyz` | ethrex `hegota-devnet` (`ethrexHegotaDevnetProfile`) |

Sources: docs.altmempool.wtf/guides/devnet (2026-11-09; its gateway host
replaces `altmempoolgateway.forshtat.com`), lambdaclass/ethrex
`hegota-devnet` `scripts/hegota-devnet/USER-GUIDE.md`. The hegota demo's
other network is a developer's own local ethrex on `localhost:8545`, not a
hosted devnet: there is no separate public assertions devnet; POST_TX runs
on `hegotaDevnet`.

## Shared ids: identity by block 0

`ChainDef` gains `sharedId?: true`: other networks use this id. Such a
declaration is that chain only where block 0 is the declared RPC's block 0.

- **Reference:** the declared RPC's block 0, read once per session and
  cached. Not a hash in the source: the alt-mempool devnet "may be reset at
  any time" (its docs), and a reset must not break it. Unreachable means
  unknown: nothing is taken to be the public devnet.
- **Checked, as built:**
  - the core, before it sends with the wallet on a `sharedId` chain
    (transactions, batches, smart batches, module actions): the wallet's
    block 0 must be the read node's, or nothing is signed ("connect the
    wallet to it, or set the id's RPC to the wallet's node");
  - the terminal, when a script switches to a `sharedId` chain: it offers the
    declared RPC to the wallet, then requires the wallet's chain to be it
    (`ensureSharedChain`, the general form of the 1337-only
    `ensureAltMempoolChain`). The terminal reads through fixed transports
    (URLs handed to the worker) and cannot read through MetaMask's RPC, so a
    local node on these ids is refused there rather than used;
  - `frames:tx`, for its `--mempool` default (`identifyChain`).
  `sim:fork` needs no check: the fork's rules follow the id's family either
  way, and its upstream is whatever RPC the id is given.
- **Different block 0:** the declaration does not apply to that node. Where
  the host lets the id's RPC be set (the CLI, tests), that node is used as
  itself; nothing is sent to it through a wallet on another network.
- **The frames module** keeps choosing a client's rules by id family (1337:
  the tracer client's profile and gas; 3151908: Hegota's), for the public
  devnet and for a local node on the same id alike: a local node on 1337 is
  taken to run the alt-mempool client, one on 3151908 Hegota's. What changes
  with identity is where it sends: the public sidecar only for the public
  alt-mempool devnet; a local 1337 node gets `canonical` (it has no sidecar).

Names: `switch altMempoolDevnet` and `switch hegotaDevnet` select the id; the
node behind it decides which chain it is. In the terminal that is the wallet,
offered the declared RPC first (as today for 1337). In the CLI, the declared
RPC unless `EVMCRISPR_RPC_URL_<id>` names another node. `switch localhost` is
viem's 1337: the same id as `altMempoolDevnet`; a wallet on a local node
makes it the local chain.

Experimental gating: module chains are registered eagerly, flag or not;
a `sharedId` chain of an experimental module is the exception, declared
only with experimental features on, so without them 1337 and 3151908 keep
no default RPC (the CLI still answers "No RPC URL configured"). With them,
a script that reads one of those ids with no wallet reads the public devnet
unless the id's RPC is set: the accepted cost of declaring them by name
(writes are guarded by the wallet check).

## Local devnets

Today: `scripts/frame-devnet.ts` starts `framesQuick` (81411, one ethrex
tracer container, never mines) and `framesMining` (81412, ethrex tracer +
Lighthouse in Kurtosis), declared in `chains.ts`, used by the live tests
(`test:devnet`: plain sender, frame account lifecycle, parity) and by the
terminal's test wallet (loopback RPCs only).

Decided 2026-11-09: the local devnets stay as they are (`framesQuick` 81411,
`framesMining` 81412, on ids of their own, `scripts/frame-devnet.ts`): the
test wallet and the frame account's live test need a local network. What
was proposed, and not done:

- The live tests move to the public devnets, where they can: parity and sends
  on `hegotaDevnet` (`test:hegota`, anvil key #0 holds devnet ETH there; the
  owner agreed to send from it), the alt-mempool devnet when it is up (no
  faucet: its genesis key is published in the sidecar repo).
- `framesQuick` / `framesMining`, their ids and `scripts/frame-devnet.ts` are
  removed. A local frame node is one you run yourself on `localhost`
  (1337, e.g. the sidecar repo's `deploy/devnet`, or `ghcr.io/forshtat/eip8141-devnet`
  with a 1337 genesis), reached with `switch localhost`; a local Hegota
  (Kurtosis, 3151908) with its RPC set for that id.
- Lost: an offline, reproducible mining devnet with anvil's accounts funded,
  which the test wallet and the account tests used. Kept: the fork stand-ins
  (anvil started with 1337 / 3151908) for every simulation test.

## Steps

1. SDK: `sharedId`, the block-0 identity check (cached; a short timeout),
   tests with a matching node and a same-id node with another block 0.
2. Declarations: `altMempoolDevnet` and `hegotaDevnet` in frames' `chains.ts`
   (`sharedId`); the frames network table reads them; Hegota's by-id-only
   entry goes. viem-frames' alt-mempool URLs follow its docs.
3. Hosts: the terminal's 1337 special case becomes the general check on any
   `sharedId` chain; the core refuses a wallet on another network than the
   read node of a `sharedId` id (CLI and terminal alike); frames defaults to
   the public sidecar only on the identified public chain.
4. The local devnets: kept (see Local devnets).

## Non-goals

- Naming a chain variant in scripts beyond its id (`switch localhost` and
  `switch altMempoolDevnet` both select 1337; the node decides).
- A local Hegota devnet of our own; POST_TX frames (next).
