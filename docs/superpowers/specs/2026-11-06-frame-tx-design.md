# `frame:tx`: EIP-8141 frame transactions in EVML

Status: design, awaiting approval (2026-11-06). Branch `viem-frames`.

## Intent

Let an EVML script describe one EIP-8141 frame transaction and send it to
the ERC-8421 alternative mempool. Why now: the Ethereum Foundation prize at
ETHGlobal Mumbai, "Best Use of the Frame Transaction Alternative Mempool",
asks for real alt-mempool usage (a transaction the alt mempool admitted, or
code that submits one). EVMcrispr's core job is turning a script into one
batched execution; frame transactions are the protocol's native form of
that, so the fit is natural and the demo shows the DSL, not a toy.

The wire format, signing and alt-mempool client already exist in
`packages/viem-frames` (commit `5cb64a5b`, proof of concept, private). This
design is the EVML layer on top of it.

## Goals

- A `frame` module with a block command `frame:tx` whose block holds the
  frames of one transaction, written with EVML's existing vocabulary.
- Sending it through the CLI to the public alt-mempool devnet (chain 1337),
  signed by a local key, and showing the admitted hash.
- Checks, before signing, that catch a block the mempool would reject for
  its shape.
- Docs and tests in the repo's usual places.

## Non-goals (this version)

- The terminal. It has no signing path for type `0x06` (browser wallets
  refuse it, and it holds no keys). It must refuse a frame action with a
  clear error, nothing more.
- Smart-account senders signing with EIP-712 through a wallet (the
  `ARBITRARY` scheme): the planned follow-up, which brings the terminal.
- `assert` as POST_TX frames: those exist only on the separate Hegota
  devnet (chain 3151908, profile `ethrex-hegota-devnet`). A later step.
- Keyed nonces other than key 0, recent roots, P256, UTXO frames.
- Simulation in `sim:fork`: anvil does not know type `0x06`.
- `--expires` (`expiry_verify`) and `deploy` frames: the expiry verifier's
  address and calldata on chain 1337 are documented nowhere we could reach
  (not in viem-frames, the hegota-support profile or the mempool docs), so
  neither can be built or tested live yet. Builder's call, recorded here.

## Anti-goals

- **No signature leaves the host unasked.** The CLI never signs a
  transaction the user has not seen. Sizing gas by simulation signs a
  provisional transaction that could be broadcast; it stays an explicit
  opt-in of the signer, not of the script: a CLI flag (see Gas).
- **No private key in a script, a variable or a module.** The key is a host
  concern (CLI), never an EVML value.
- `@evmcrispr/core` and `@evmcrispr/sdk` do not depend on
  `@evmcrispr/viem-frames` (private, unpublished, and tied to a draft).
- Std learns nothing about frames: no frame-only option on std's `exec`.

## The language (decided with the owner)

A frame is one call. The block lists the transaction's frames in order.

```evml
load frame [tx verify default]

tx (
  verify @me --approve execution                       # only_verify
  default (
    exec $sponsor "pullFee(address,uint256)" @me 1e6   # pre_verify of the next frame
  )
  verify $sponsor "verify()" --approve payment         # pay
  exec $usdc "approve(address,uint256)" $router 100e6  # SENDER frame
  batch (                                              # atomic SENDER frames
    exec $router "swap(…)" …
    exec $vault "deposit(uint256,address)" 100e6 @me
  )
)
```

| Written | Frame(s) |
|---|---|
| `exec …` (std, unchanged) | one SENDER frame: called by `tx.sender`. If it fails the later frames still run. |
| `batch ( … )` (std) | its frames carry `ATOMIC_BATCH_FLAG` except the last: all or nothing |
| `default ( exec … )` | every `exec` inside is a DEFAULT frame: called by the entry point `0xaa`, not by you |
| `verify <target> [<sig> <args…>] --approve execution\|payment\|both` | one VERIFY frame |
| no `verify` and no `--paymaster` | `self_verify` on the sender, added first |
| `--paymaster <addr> [--paymaster-data <bytes>]` | `[only_verify on the sender, pay on <addr>]` |

- **Order is literal.** Frames come out in the order written; the only
  frames `frame:tx` adds are the shortcuts' (`self_verify`, or
  `--paymaster`'s pair), at the start. A `default` frame written directly
  before a `verify` with the same target is that verify's `pre_verify`; to
  use one, write the verifies out (the `--paymaster` shortcut takes no
  `pre_verify`). A `default` frame after the validation prefix is an
  ordinary body frame. A `default` frame anywhere else in the prefix is an
  error (the mempool rejects it).
- `default` and `verify` are frame-module commands. EVML has no
  block-scoped names (the module-system rework removed them), so they are
  written `frame:default` / `frame:verify`, or unprefixed after
  `load frame [tx verify default]`, the usual import list. Outside a
  `frame:tx` block they are an error.
- `default` and `batch` compose both ways: `default ( batch ( … ) )` is an
  atomic group of DEFAULT frames; a `batch` may hold `default ( … )`. A
  batch may not hold a `verify` (the spec forbids VERIFY in a batch).
- `verify` stays a command, not a block: a VERIFY frame is a static call
  whose target must execute `APPROVE` itself, so an arbitrary `exec` there
  would always invalidate the transaction. `--approve` names the scope the
  frame permits (its flags), not something EVMcrispr does.
- Per-frame gas: see Gas below.

### Rules checked before signing

EVML's static analysis has no module hooks, so `frame:tx` checks these when
it builds the transaction, before the action exists, and the run stops
there: nothing of that transaction is signed. (Revised while planning:
the design first said "static analysis".)

- The validation prefix is one of the shapes the mempool recognizes:
  `[self_verify]` or `[only_verify, pay]`, with at most one `pre_verify`
  (a `default` frame with the same target) right before each approving
  `verify`. (`deploy` and `expiry_verify` are out of this version; see
  Non-goals.)
- `verify --approve execution|both` targets the sender (`@me` / `@sender`).
- `verify` frames come before any SENDER frame.
- `--paymaster` and an explicit `verify --approve payment` are exclusive.
- No `verify` inside `batch`; no approval scope inside a batch.
- At most 64 frames (`MAX_FRAMES`).
- Commands inside the block produce only transaction actions on the
  current chain from the current sender (no wallet/RPC/terminal actions, no
  `switch` to another chain or account): the frames of one transaction.

## Gas (owner's decision)

- **Execution gas:** `exec`'s existing `--gas` becomes that frame's
  `limits.execution`.
- **State gas:** `frame:tx --state-gas <n>` sets `limits.state` for every
  body frame (SENDER and DEFAULT frames after the prefix). Unused state gas
  is refunded, so a generous value costs only the reservation. Validation
  frames keep their own (0 for the builders' defaults).
- **Missing limits:** the local key is an account without code, whose frames
  cannot be estimated without a real signature. A body frame without
  `--gas`, or a `frame:tx` without `--state-gas`, therefore needs the CLI
  flag `evmcrispr run --size-by-simulation`, which signs a provisional
  transaction with generous limits and sends it to the devnet's ethrex node
  to size them (viem-frames' `sizeBySimulation`). The flag is the signer's
  consent: the provisional transaction could be broadcast by whoever
  receives it. Without the flag, the run fails before signing anything and
  says which frames lack limits and what to add.
- A sender with code (out of this version's signing path, but the handler
  should not preclude it) is estimated by the sidecar.

## Execution

- `frame:tx` returns one new action, added to the SDK's `Action` union:

  ```ts
  interface FrameAction {
    type: "frame";
    chainId: number;
    from: Address;            // tx.sender
    frames: FrameSpec[];      // mode, approve scope, atomic flag, target,
                              // data, value, gas?, stateGas?
    stateGas?: bigint;        // frame:tx --state-gas
    mempool: "alt" | "canonical";
  }
  ```

  The frames are fully laid out at interpretation time (prefix included),
  so review shows exactly what is signed except gas filled later.
- **How `default` marks its frames (builder's call, recorded here).** The
  `default` command returns ordinary `TransactionAction`s and records them
  in a module-private `WeakSet` (the identity pattern declared errors use).
  Std `batch` keeps the same objects in its `BatchedAction`, so the mark
  survives `batch ( default ( … ) )` and `default ( batch ( … ) )`. No SDK
  field is added: the marked actions never reach an executor, because
  `default` resolves only inside a `frame:tx` block and `frame:tx` consumes
  everything its block returns. `frame:tx` refuses an action shape it does
  not expect rather than passing it on.
- `@evmcrispr/core`'s default `frame` handler throws "this host cannot send
  frame transactions". Hosts supply one through the existing
  `handlers` override.
- The CLI's `frame` handler uses `@evmcrispr/viem-frames`: a wallet client
  on the action's chain with the CLI's local account, `withFrames` +
  `altMempoolActions`, then `sendFrameTransaction`. It reports the hash
  through `ctx.onSent` as soon as the sidecar admits the transaction, then
  waits up to two minutes for the receipt and prints each frame's status
  and the payer. If it is not mined by then, the run stops there with the
  sidecar's status and the explorer link: a pending frame transaction holds
  the sender's nonce, so a later transaction from the same sender would
  collide with it. (Builder's call, recorded here: on 2026-11-06 the devnet
  admitted frame transactions and bundled none.)
- The terminal's handler refuses (non-goal), with the reason and the CLI
  alternative.

## Signing (owner's decision: a local key in the CLI first)

- The CLI takes a private key for `run` from an environment variable,
  `EVMCRISPR_PRIVATE_KEY`, never from argv (it would land in shell
  history and process listings). It builds a local viem account from it.
  It is mutually exclusive with `--wallet-rpc`/`--account`.
- The local account signs ordinary transactions too, so the CLI gains a
  general local-key mode; that is acceptable and is how a frame transaction
  and an ordinary one in the same script share a sender.
- The key is never logged, echoed in errors, or passed into the EVML
  environment.
- **Confirmation (owner's decision).** With the local key, the CLI shows
  every transaction before signing it (an ordinary call: chain, to, value,
  decoded call where it can; a frame transaction: each frame's mode, scope,
  target, value, call and limits, and the payer) and asks y/N. Without a
  terminal (piped stdin, CI, the live test) it signs only with an explicit
  `--yes`, and otherwise stops before signing. The confirmation also covers
  the provisional transaction `--size-by-simulation` signs: it is shown,
  marked as provisional, before it is sent to the node.

## Chain

- The devnet is chain 1337, which viem also uses for `localhost` (and
  `tempoLocalnet`). The module declares it in `modules/frame/src/chains.ts`
  as `altMempool` with the gateway
  `https://altmempoolgateway.forshtat.com/rpc` and explorer
  `https://explorer.altmempool.wtf`. The builder must check what declaring
  a module chain with an id viem already knows does to `switch`, RPC lookup
  and the terminal's network list, and keep `localhost` working.
- Simulation (the gas sizing opt-in) uses the devnet's ethrex node
  `https://altmempool.forshtat.com`, which viem-frames already knows.

## Module

- `modules/frame`, `experimental: true` (hidden from stable builds, like
  acl and circom), `load frame`.
- Commands: `frame:tx`, and `default`, `verify` resolved inside its block.
  Each with its `.md` (description, the frame table above, examples that
  validate).
- A guide, `apps/evmcrispr-website/src/content/docs/guides/frame-transactions.md`,
  with the "Combining with" tail the guides use, explaining frames,
  verification, payment and the alt mempool.

## Tests

- Unit (module): each row of the table above becomes the expected frames;
  each shape rule has a passing and a failing script; the prefix shapes
  come out right with and without `--paymaster`.
- Unit (CLI): the key comes only from the environment; it is refused with
  `--wallet-rpc`; it never appears in output; a transaction is signed only
  after a yes (TTY) or with `--yes` (non-TTY), and nothing is signed on a
  no; `--size-by-simulation` is required for missing limits and its
  provisional transaction is confirmed too.
- Handler: against a mocked sidecar (as viem-frames' client tests do), the
  action becomes the expected `eth_sendFrameTransaction` call.
- Live, opt-in (`EVMCRISPR_FRAME_DEVNET=1`): `evmcrispr run --yes` of a script
  with `frame:tx` against the devnet, admitted. Mining stays a separate
  opt-in (on 2026-11-06 the devnet admitted but bundled nothing).

## Decisions taken in review

- The CLI confirms each transaction before the local key signs it; `--yes`
  without a terminal (owner).
- State gas on `frame:tx`, sizing by simulation as a CLI flag (owner).
- Literal frame order and explicit `pre_verify`; `--expires`/`deploy` cut;
  a private `WeakSet` marks `default` frames; the two-minute receipt wait
  (builder's calls, above).

## Left to the builder

- Where in `frame:tx` the commands of the block are flattened into frames,
  and the exact `FrameSpec` fields.
- Error wording, within the repo's message conventions (chain names, no raw
  wei; see the message-format helpers in the SDK).
