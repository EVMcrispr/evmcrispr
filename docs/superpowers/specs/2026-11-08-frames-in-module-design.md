# Frames in the frames module, a dev wallet, and local devnets

Status: design, awaiting approval (2026-11-08). Decided with the owner in
conversation on 2026-11-08. Builds on `2026-11-06-frame-tx-design.md`,
`2026-11-07-frame-smart-accounts-design.md` and
`2026-11-08-frame-simulation-design.md`, and changes parts of each (listed
at the end).

## Intent

Frame transactions work today, but most of the code that makes them work
lives in the hosts, not in `modules/frames`:

| Where | What is frame-specific there |
|---|---|
| `packages/core` | `frame` in `ActionHandlers`, a default handler that refuses it, naming the terminal |
| `packages/sdk` | `FrameAction` and `FrameSpec` in the `Action` union |
| `packages/cli` | removed on 2026-11-08 (see section 4): it had `lib/frame-handler.ts`, the `EVMCRISPR_PRIVATE_KEY` local wallet with its confirmations (`local-signer.ts`, `local-wallet.ts`, `confirm.ts`, `--yes`), `--size-by-simulation` and the viem-frames dependency |
| `apps/evmcrispr-terminal` | `runs/frame-handler.ts`, `wallet/alt-mempool-chain.ts`, chain 1337 in `config/rpc.ts`, ~100 lines of frame summaries in `runs/action-summary.ts`, `frameGateway` in the run manager |

The owner wants it as close to the frames module as possible, with
extensions (sim among them) rather than host code. And wants people to try
every kind of frame transaction from the terminal, including from a plain
address, which no browser wallet can sign today.

## Goals

- `modules/frames` owns its action: how it is described for review, sent,
  and simulated. Hosts carry no frame code: they review, sign through a
  wallet, and pass the module's action to the module.
- A plain address can send a frame transaction from the terminal, through
  a dev wallet of anvil/hardhat accounts (experimental, local chains only).
- Local devnets that run frames, started by one script, with those accounts
  funded.
- `sim:fork` simulates frames through an extension point the frames module
  implements.

## Non-goals

- Signing a plain sender's frame transaction with MetaMask or any other
  third-party wallet: none of them can (see Signing).
- EIP-7702 delegation of a wallet's own address to frame-account code
  (wallets only sign delegations to their own contract; ethrex untested).
- P256 / passkey senders.
- The ERC-8421 sidecar on local devnets: locally, `--mempool canonical`
  sends straight to ethrex.

## Anti-goals (kept from the earlier designs)

- No private key in a script, a variable or a module, and no secret key in
  any host: the dev wallet's keys are public by construction.
- Nothing is signed that the run's review has not shown: the frames are
  reviewed through the module's description before any wallet is asked.
- `@evmcrispr/core` and `@evmcrispr/sdk` stay free of viem-frames and of
  frames.

## Design

### 1. Actions a module owns (SDK + core)

A module can declare the kinds of action it produces:

```ts
// in defineModule (sketch, names to settle in the plan)
actions: {
  frame: defineAction<FrameActionData>({
    describe(action, env): ActionDescription,   // what review shows
    send(action, ctx): Promise<unknown>,        // what executing does
    simulate?(action, sim): Promise<SimReceipt>, // what sim:fork does
  }),
}
```

- The `Action` union gains one generic member, a **module action**:
  `{ type: "module"; module: string; kind: string; chainId: number; from:
  Address; data: … }`. `FrameAction` and `FrameSpec` leave the SDK; their
  types move to `modules/frames`. `frames:tx` returns a module action whose
  `data` is today's frames, mempool and account.
- **Core dispatch.** `ActionHandlers` loses `frame` and gains `module`. The
  default `module` handler finds the action's module in the registry and
  calls its `send`. A host that gates (the terminal's review) wraps the `module` handler like any other, and calls
  `ctx.next` once the action is passed: the module only ever sends what was
  reviewed.
- **`send`'s context** is the one every handler already gets
  (`walletClient`, `getPublicClient`, `transports`, `onLog`, `onSent`,
  `signal`), plus `fetch` through the run's transports for the gateway. No
  host type is passed.
- **`describe`** returns a host-neutral description: a title, one line per
  frame (mode, scope, target, value, call decoded where it can be, limits),
  the payer, and notes. The terminal renders it in its action summary and
  review. It replaces `describeAccountFrames` in the terminal.
- Hosts that do not know a module action at all (an older host, a custom
  one) still work: the default handler sends it, and review falls back to
  showing the description.

Builder's check: a module action must survive the paths actions travel
today: the worker boundary (actions are proxied to the main thread),
`simulate` captures, `$> $tx` captures, the assistant's `simulate`, and the
review gate's snapshot. Each gets a test with a module action.

### 2. Sending, in the module

`modules/frames/src/send.ts` takes what is in
`apps/evmcrispr-terminal/src/runs/frame-handler.ts` today, and what the CLI's
frame handler did for plain senders (in the `frametx` branch), without host
specifics:

- **Account sender** (`frames:tx --account`): the wallet signs
  `FrameTransaction(bytes32 sigHash)` as EIP-712 typed data
  (`eth_signTypedData_v4`), as the module's `sendAccountFrameTransaction`
  does now.
- **Plain sender** (owner, 2026-11-08): the connected wallet is asked
  as if it supported frame transactions, with the standard
  `eth_signTransaction` and a type `"0x6"` request (the frames, the nonce
  and the fees the module filled in; defined in
  `2026-11-08-dev-wallet-design.md`, section 4). A wallet that implements
  EIP-8141 then works with EVMcrispr unchanged; the test wallet is the
  first to. EVMcrispr does not refuse a plain sender: a wallet that cannot
  sign one answers with its own error (unsupported method or type), shown
  as it is, with the hint "send from a frame account with `--account`, or
  connect a wallet that signs frame transactions (the test wallet,
  experimental)". It replaces the invented `wallet_signFrameTransaction`
  and the raw-hash `wallet_signHash` this spec had. A frame account's
  transaction keeps `eth_signTypedData_v4` by its owner.
- The module checks the returned signature recovers to the sender before
  it is sent, as Safe's `requestSafeSignature` does.
- **Where it is sent** comes from the chain, not from the module's code:
  a frame network table in `modules/frames/src/networks.ts` (chain id,
  ethrex node URL, optional gateway, explorer, profile). It holds the
  public alt-mempool devnet (1337) and the local devnets (81411, 81412), each
  overridable through the host's transport for that chain (the terminal's
  RPC settings). The
  alt mempool needs a gateway; the canonical mempool goes to the node.
  `frames:tx` refuses a chain that is not in the table, by name.
- **Gas.** `--size-by-simulation` goes. An account sender is sized by the
  sidecar (`eth_estimateFrameTransactionGas`, no signature), as now. A plain
  sender's body frames without `--gas` are sized by the module's own
  in-process simulation (section 5) once it exists; until then they need
  `--gas`, and the error says so. Every body frame's state gas defaults to
  a generous reservation (unused state gas is refunded) unless
  `--state-gas` is set. Nothing signs a provisional transaction any more.
- After sending, the module logs admission, waits for the receipt (two
  minutes, as now), logs the payer and each frame's status, and returns the
  receipt. Everything from the gateway or node goes through viem-frames'
  `printable` first.

**viem-frames (decided 2026-11-08: a standalone library).** It stays a viem
extension of its own, in the manner of `viem/tempo`, and knows EIP-8141 and
the alt mempool, never EVMcrispr: its errors name its own API (a frame's
`gas` / `stateGas`), its log lines carry a level the caller shows, and it
ships no account contract. Done on 2026-11-08:

- the EVML wording of the limit checks moved to `frames:tx --account`
  (`requireLimits` in `modules/frames/src/layout.ts`, at interpretation);
- the FrameAccount part moved to `modules/frames/src/account.ts`: the
  "EVMcrispr Frame Account" EIP-712 domain, `frameAccountTypedData`, and
  `sendAccountFrameTransaction` (the owner check, the typed-data signature,
  its recovery), built on viem-frames'
  `sendFrameTransactionWithArbitrarySignature({ sender, frames, sign })`,
  which takes the signature entry's bytes from `sign(sigHash)`;
- `describeAccountFrameTransaction` became the generic
  `describeFrameTransaction` ("the sender", "the paymaster").

Consequence: the frames module now depends on viem-frames, and the module
build leaves packages external (`--packages external`), so publishing the
frames module requires publishing viem-frames (and with it
`@forshtat/hegota-support`, pinned exactly, MIT) first. Both are
experimental; nothing is released yet.

### 3. The test wallet (terminal)

Moved to its own spec, `2026-11-08-dev-wallet-design.md` (anvil's and
hardhat's accounts, loopback-RPC chains only, every signature shown and
asked, clear signing decoded from the bytes signed,
`eth_signTransaction` for frame transactions).

### 4. The CLI: no frame code, no local key (done 2026-11-08)

Everything the frame work added to `packages/cli` was removed on
2026-11-08, restoring it to its state before the series (`a98fa7e5`): the
frame handler, `--size-by-simulation`, and the `EVMCRISPR_PRIVATE_KEY` local
wallet with its confirmations and `--yes`. The local key had been added only
for frames, and the dev wallet covers testing from the terminal. The CLI
signs, as before, only through `--wallet-rpc` and `--account`, and sends no
frame transaction: core's default handler refuses one, naming the terminal.
The copy of the history as it was is the `frametx` branch.

If the CLI later needs to sign on a devnet, the small version is the same
dev accounts as the terminal (public keys, loopback RPC only), not a
private key with a confirmation layer.

### 5. Simulation (sim extension point)

The frame-simulation design stands, with one change of place: the executor
and its opcode table live in `modules/frames/src/simulate/`, and sim offers
the extension point.

- sim's in-process backends expose a small interface to a module action's
  `simulate`: `call({ caller, to, data, value, gas, isStatic })`,
  `checkpoint()/commit()/revert()`, `bumpNonce(address)`, reads, and
  `withOpcodes(table, run)` to install extra opcodes for one transaction.
  ethereumjs implements it first; revm, anvil, hardhat and tenderly refuse
  a module action that needs it, naming ethereumjs.
- `sim:fork` dispatches a module action to its module's `simulate`, and
  records the receipt it returns like any other (captures, relay scan,
  suggestions).
- Also not modelled, measured on the Kurtosis devnet on 2026-11-08: a
  value transfer logs an EIP-7708 `Transfer` from `0xff…fe` (Amsterdam),
  and creating an account costs state gas (183,600 for one). The
  simulation emits neither; the docs say so, and suggested assertions do
  not rely on transfer logs.

### 6. Local devnets

`scripts/frame-devnet.ts`, in the manner of `scripts/anvil-config.ts`:

- **The devnets are chains** (owner, 2026-11-08: "configure the rpcs as
  viem chains that you can switch to", not ports in env variables). The
  frames module declares them in `modules/frames/src/chains.ts`, so
  `switch framesQuick` / `switch framesMining` reach them, the terminal's
  network list and the test transports pick them up, and the script reads
  its ids and ports from the same declarations:
  - `framesQuick`, chain **81411**, `http://127.0.0.1:8570`;
  - `framesMining`, chain **81412**, `http://127.0.0.1:32003`.

  The ids are their own (free in viem and in ethereum-lists/chains,
  2026-11-08): the images' defaults collide, 9 with viem's `quai` and
  `zksyncLocalHyperchainL1`, and 3151908 with the public Hegota devnet and
  every Kurtosis devnet. 8570 sits outside anvil's test-port lock range
  (8545-8560).
- `up quick`: the one-container ethrex devnet
  (`ghcr.io/forshtat/eip8141-devnet`, pinned by digest): the image's
  `l1-hegota.json` read out of it at run time, its chain id set to 81411 and
  anvil's ten accounts funded, mounted in place of the image's (nothing
  vendored). Never mines (ethrex's `--dev` producer cannot drive Hegota);
  for simulation, admission and the parity test.
- `up mining`: the single-node Kurtosis devnet (ethrex + Lighthouse,
  ethereum-package and images pinned as in the sidecar's
  `eip8141-single-node.yaml`), `network_id` 81412, anvil's accounts in
  `prefunded_accounts`. Frames from about 7 minutes after start. The script
  checks Kurtosis published the RPC on the declared port and refuses
  otherwise.
- `down` and `status` (each declared chain: running, on the right chain id,
  its block and anvil #0's balance).
- Both images are amd64 only; the script says so on other machines.

Verified by hand on 2026-11-08: both devnets run here; a viem-frames
self-verify transaction simulates, is admitted on both, and is mined on
the Kurtosis one (block 69, payer and frame receipts as expected).

### 7. Frame accounts: a CREATE2 factory and ERC-7579 (owner, 2026-11-08)

Inspired by the ERC-7579 accounts of `forshtat/hegota-demo`
(`contracts/erc7579/MinimalERC7579Account.sol`,
`MinimalERC7579AccountProxyFactory.sol`), without their fixed-module shell
or raw-opcode dispatcher. The demo's account is the actor inside a
transaction a plain address sends; ours stays the sender itself.

**Today.** `FrameAccount.sol` is deployed whole by `frames:new-account`, an
ordinary deployment whose address comes from the deployer's nonce; its
owner and EIP-712 domain separator are immutables; it has one function,
`verify(uint8 scope)`. Each account deploys its own `HegotaSupport` opcode
helpers in its constructor.

**Proposed.**

- **One implementation, one factory, clones.** `FrameAccount` becomes an
  implementation deployed once per chain (its `HegotaSupport` helpers with
  it, once). `FrameAccountFactory.createAccount(owner, salt)` deploys a
  clone of it with CREATE2, the owner carried as the clone's immutable
  argument (read with `EXTCODECOPY` of `address(this)`, as the demo's proxy
  does, so the VERIFY frame reads no storage). A delegatecall chain keeps
  the clone as the executing account: the implementation's `approve`
  delegatecalls the APPROVE helper, so the approval is the clone's.
  `getAddress(owner, salt)` predicts the address; `createAccount` is
  idempotent (an existing clone is returned, not redeployed).
- **The EIP-712 domain is unchanged** ("EVMcrispr Frame Account", version
  1, the chain, `verifyingContract` = the account), computed at call time
  from `address(this)` instead of an immutable. The typed data the owner
  signs, `frameAccountTypedData` and the module's `send` do not change.
  Accounts deployed before the factory (v1) are **devnet leftovers**
  (owner, 2026-11-08): nothing is done to support or migrate them, and the
  docs say to create a new account.
- **Same addresses on every chain.** The implementation and the factory are
  deployed through the deterministic CREATE2 deployer
  (`0x4e59b44847b379578588920cA78FbF26c0B4956C`, present on both local
  devnets, checked 2026-11-08, and on the Hegota devnet). Their addresses go
  in the module's address book.
- **ERC-7579, as far as EVMcrispr's smart batches need it**
  (`packages/sdk/src/onchain/smart-execution.ts` reads `accountId`,
  `isModuleInstalled(2, executor)`, `supportsExecutionMode` for single and
  batch, then calls `execute` / `executeFromExecutor`):
  - `execute(mode, executionCalldata)`: only from the account itself (a
    SENDER frame whose target is the sender), single and batch call types,
    the default (reverting) exec type; delegatecall and try mode refused.
  - `executeFromExecutor` for installed executor modules (type 2), and
    `installModule` / `uninstallModule` for executors only, from the
    account itself. Validators are not modules here: the owner check in
    VERIFY is the account's only validation (rotation and recovery stay
    non-goals).
  - `isModuleInstalled`, `supportsModule(2)`, `supportsExecutionMode`,
    `accountId()` = `"evmcrispr.frame-account.2.0.0"`.
  - `isValidSignature` (ERC-1271): the owner's ECDSA signature, wrapped
    per account with **ERC-7739** nested typed data (owner, 2026-11-08), so
    a signature made for one account is not valid for another account of
    the same owner. The account can then sign permits, SIWE and the like
    through its owner.
  - Token receivers (ERC-721 / ERC-1155 `onReceived`) and `receive()`.
- **In EVML.**
  - `frames:new-account <variable> [--owner <address>] [--salt <n>]`
    deploys through the factory (and the factory itself first, through
    the deterministic deployer, when the chain lacks it), and binds the
    address; on a chain where that account exists it only binds it.
  - `@frames:account(<owner> [salt])`: the address an owner's account has
    or will have, without deploying, so an account can be funded first.
  - Later: a smart batch (`batch !(...)`) inside `frames:tx --account`,
    lowered through the account's ERC-7579 route (the composable executor
    installed once with `installModule`). `frames:tx` refuses smart-batch
    actions today, and the frame simulation (section 5) would run it.
- **Builder's checks.** Whether the clone-with-arguments and ECDSA come from
  OpenZeppelin (audited; `Clones.cloneDeterministicWithImmutableArgs`,
  `fetchCloneArgs`, `ECDSA`) needs the module's contract build, which
  compiles through hegota-support's `compileSolidity`, to resolve
  OpenZeppelin imports; otherwise a minimal clone written here, tested
  byte for byte. And the VERIFY frame's gas with the extra delegatecall
  (the current 40,000 budget; the old account used about 15,000).

## Tests

- **SDK/core**: a test module's action is sent by its module, gated by a
  wrapping handler, reviewed through `describe`, carried across the worker
  boundary and captured by `$> $tx`.
- **Frames module, unit**: `send` against a mocked gateway and node for both
  senders; a wallet refusing `eth_signTransaction` for type 0x06 → its error with the hint above; a returned transaction whose fields differ from the request is refused; a signature that
  recovers to someone else is refused; a chain outside the network table is
  refused. The terminal's frame-handler tests (and, from `frametx`, the CLI's
  plain-sender ones) move here
  where they test behaviour that stays.
- **Test wallet**: its tests are in `2026-11-08-dev-wallet-design.md`.
- **Live, opt-in**: against `frame-devnet up quick`, a plain-sender and an
  account-sender `frames:tx` admitted; against `up mining`, mined. They
  run in the frames module's tests, signing with anvil account #0 through a
  viem local account in the test (a key in test code, never in a script). `foreign-writers.test.ts` and
  `ui-conventions.test.ts` extended where entry points or components are
  added.

## Steps

0. Done 2026-11-08: the CLI's frame code and local key removed (section 4).
1. SDK module actions + core dispatch; frames module returns one; the
   terminal's frame handler replaced by the module's `send` (behaviour
   unchanged: account senders only).
2. viem-frames made publishable (version, `files`, its own README as the
   package's docs) and added to `scripts/publish-packages.ts` ahead of the
   frames module.
3. Done 2026-11-08: `eth_signTransaction` (type 0x06) for plain senders in
   the module's `send` (viem-frames' `sendFrameTransactionFromWallet`,
   `formatFrameTransactionRequest` / `parseFrameTransactionRequest`); the
   frame network table (`modules/frames/src/networks.ts`: 1337, framesQuick,
   framesMining; the quick devnet is not waited on once admitted);
   `sizeBySimulation` removed from viem-frames; body frames reserve 200,000
   state gas by default. Not done: sizing an account sender's frames with the
   sidecar's estimate (every call still needs `--gas`), and refusing a chain
   outside the table at interpretation (the review warns, the send refuses).
   Live: a plain sender admitted on `up quick` and mined on `up mining`.
4. The test wallet, gallery first (`2026-11-08-dev-wallet-design.md`, its own steps).
5. `scripts/frame-devnet.ts`, funded anvil accounts, live tests.
6. The simulation extension point and the frame executor
   (`2026-11-08-frame-simulation-design.md`), then gas sizing from it.

7. Frame accounts through a CREATE2 factory, with the ERC-7579 surface
   (section 7); then smart batches inside `frames:tx --account`.

Each step leaves the tree building and its tests passing.

## Changes to earlier designs

- `2026-11-06-frame-tx-design.md`: no frame handler and no local key in the
  CLI (its "Signing" section is void), no `--size-by-simulation`; the
  terminal is no longer a non-goal; sending is not limited to chain 1337.
- `2026-11-07-frame-smart-accounts-design.md`: the account path moves from
  the hosts into the module; its signing stays EIP-712 by the owner. Its
  non-goal "a factory or counterfactual (CREATE2) addresses" is lifted by
  section 7 (deploy frames stay out: an account is still deployed by its
  own transaction before it sends).
- `2026-11-08-frame-simulation-design.md`: the executor lives in
  `modules/frames`, behind a sim extension point; the two unmodelled effects
  in section 5 are added; its parity test runs against `frame-devnet up
  quick` (no public node, throwaway keys).

## Open questions for the owner

- **Public alt-mempool devnet in the terminal**: it stays reachable with a
  frame account and a browser wallet; with the test wallet it is refused
  (public RPC). Is that the line you want?
