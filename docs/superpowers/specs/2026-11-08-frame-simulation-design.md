# Simulating frame transactions in `sim:fork`

Status: design, awaiting approval (2026-11-08). Follows
`2026-11-06-frame-tx-design.md` (which left simulation out) and
`2026-11-07-frame-smart-accounts-design.md`.

## Intent

`sim:fork` cannot run a `frames:tx`. Until 2026-11-08 it did not even say
so: a frame action reached `execAction`, matched no case and returned
`undefined`, so the fork ended with "All transactions succeeded" and no
frame had run. It now refuses the action (`modules/sim/src/commands/fork.ts`,
pinned by `test/integration/commands/fork-frame.test.ts` on anvil,
ethereumjs and revm). This design replaces that refusal, on one backend,
with a real simulation: the frames run in order on the fork's state, with
the EIP-8141 opcodes the frame contracts use, and the run reports each
frame's outcome and the payer.

What it gives a script author:

- `frames:new-account`, `frames:new-sponsor`, funding and a `frames:tx` that
  uses them, all in one fork, checked before anything is signed;
- `sim:expect` and `assert` after a frame transaction, as after any other;
- each body frame's gas as measured, which is what `--gas` should be set
  to (today it comes only from `--size-by-simulation`, which signs).

## Why not the other routes

- **anvil, hardhat, tenderly**: none of them knows type `0x06`.
- **The devnet's ethrex node (`ethrex_simulateFrameTransaction`, which
  viem-frames' `sizeBySimulation` uses)**: it is exact, but it is not a
  fork. 1) It takes a signed raw transaction, and a simulation must not ask
  for a signature (for a `FrameAccount` sender it would mean one wallet
  prompt per simulated transaction). 2) It runs against the devnet's own
  latest state, so nothing done earlier in the fork exists for it:
  `sim:set-balance`, earlier transactions, an account made by
  `frames:new-account` in the same block. 3) It exists only on that devnet.
  It stays what it is today, the gas sizer behind `--size-by-simulation`,
  and becomes the reference the in-process simulation is tested against
  (see Tests).
- **revm instead of ethereumjs**: revm 42 can take custom instructions too,
  but the executor would then be Rust, behind the miss-and-replay boundary,
  and every change would rebuild the committed WASM artifacts. ethereumjs
  is the default backend (`fork.ts:138`), takes custom opcodes through a
  public option (`customOpcodes` in `@ethereumjs/evm` 10.x) and runs each
  call through `evm.runCall`, which already takes any caller and a static
  flag. revm keeps the refusal, with a message naming ethereumjs; porting
  is a follow-up once the executor has settled.

## What a stock EVM is missing

The frame contracts inherit `HegotaSupport(Devnet.ERC8421_WORKSHOP)`
(`@forshtat/hegota-support` 0.0.1). Its constructor deploys one small Yul
helper per opcode, and each helper's runtime is that opcode with its
operands taken from calldata. Deploying them works on any EVM; executing
them hits an invalid opcode. The devnet (profile `ethrex-eip8141-tracer`)
has these:

| Opcode | Byte | Reached through | Reads or does |
|---|---|---|---|
| APPROVE | `0xaa` | `delegatecall` (acts on the account) | approves `scope` for the executing account, ends the frame as RETURN does |
| TXPARAM | `0xb0` | `staticcall` | a field of the transaction (`TxParam`, 17 values; `0x05` unassigned, `0x06` MAX_COST is an ethrex addition) |
| FRAMEDATALOAD | `0xb1` | `staticcall` | a word of a frame's data |
| FRAMEDATACOPY | `0xb2` | `staticcall` | bytes of a frame's data |
| FRAMEPARAM | `0xb3` | `staticcall` | a field of a frame (`FrameParam`: target, limits, mode, flags, status, gas used…) |
| SIGPARAM | `0xb4` | `staticcall` | a field of a signature entry |
| SIGDATACOPY | `0xb5` | `staticcall` | bytes of a signature entry |

`TXTRACE` (`0xb6`) and `EVENTDATACOPY` (`0xb7`) exist only on the Hegota
devnet (chain 3151908); the workshop devnet has no helper for them, and the
simulation leaves them invalid, as the devnet does.

The opcodes are not all there is. A frame transaction also has its own
execution rules, which the simulation must follow:

- frames run in order; DEFAULT and VERIFY frames are called by the entry
  point (`0x00000000000000000000000000000000000000aa` on the devnet), SENDER
  frames by `tx.sender`; a `null` target is the sender itself;
- VERIFY frames run static, and end by APPROVE, with a scope the frame's
  flags allow, executed by the frame's target;
- after the validation prefix, execution must have been approved by the
  sender and payment by some account (the payer); otherwise the
  transaction is invalid and nothing of it is included;
- a failed SENDER or DEFAULT body frame does not stop the frames after it,
  unless it is in an atomic group (`ATOMIC_BATCH` flag `0x4`), in which
  case the whole group rolls back and the group's remaining frames are
  `skipped`;
- the sender's nonce (key 0, `nonce_seq`) is used once per transaction.

## Design

### Where the code lives

> **Superseded (2026-11-08)** by `2026-11-08-frames-in-module-design.md`,
> section 5: the executor and opcode table live in
> `modules/frames/src/simulate/`, and sim offers an extension point (a module
> action's `simulate`, given a small backend interface). The bullets below
> are the earlier placement, kept for the reasoning.

- `modules/sim/src/lib/frames/` holds the executor, the opcode table and the
  devnet's constants. sim already simulates other forms of transaction
  that need their own rules (an EIP-5792 batch as a 7702 delegation, a
  smart batch); the frames module describes a transaction and does not run
  one. The input is the SDK's `FrameAction`, whose frames are fully laid
  out at interpretation time (`modules/frames/src/layout.ts`), so the
  executor does not depend on the frames module.
- The devnet's numbers (entry point, mode and scope values, the
  ATOMIC_BATCH bit, the TxParam/FrameParam/SigParam indexes) are copied
  into one file with a comment naming the profile they come from
  (`ethrex-eip8141-tracer`, hegota-support 0.0.1). A test compares the copy
  with the package's profile and enums (hegota-support is a devDependency
  of sim for that test only), so a new profile is noticed.
- `SimBackend` gains an optional `handleFrameAction(action)`. ethereumjs
  implements it; `fork.ts`'s refusal becomes "this backend cannot run
  frame transactions: simulate them with `--using ethereumjs`" for the
  others.

### The executor (ethereumjs)

1. **Check the chain.** Frames are simulated only on a chain that runs them:
   the devnet's chain (1337, named through `chainLabel`). Elsewhere the
   refusal stays, because a fork of a chain without EIP-8141 would succeed
   where sending fails.
2. **Build the context**: sender, nonce (the fork's nonce of the sender),
   fees (the fork block's base fee, priority fee 0), the frames with their
   resolved targets, and one signature entry, as the CLI sends it (see
   Signatures). `SIG_HASH` is the transaction's signature hash computed as
   the devnet does; see Open questions for where that code comes from.
3. **Run the validation prefix**, each frame through `vm.evm.runCall`:
   caller the entry point, `isStatic` for VERIFY, gas the frame's limit.
   After each VERIFY frame, the executor reads the approval it recorded (or
   failed to). A frame that reverts, or ends without approving, makes the
   transaction invalid: the simulation throws, naming the frame and what it
   did not approve, and nothing of it is committed.
4. **Run the body**, each frame under its own journal checkpoint, an atomic
   group under one checkpoint for all its frames. SENDER frames are called
   by the sender with the frame's value; DEFAULT frames by the entry point.
   A frame without `--gas` gets the generous limit ordinary in-process
   transactions get today (30,000,000).
5. **Bump the nonce** once, commit, and return a receipt.

The opcode handlers are closures over the running transaction's context:
the current frame index, each finished frame's status and gas used, and
the approvals so far. APPROVE checks that the frame is a VERIFY frame, that
the executing address (`runState.interpreter.getAddress()`, which is the
account under the helper's `delegatecall`) is the frame's resolved target,
and that the scope is one the frame's flags allow. It records the scope and
ends the frame with `runState.interpreter.finish(new Uint8Array())`, the
way RETURN does.

### Signatures (builder's call, to confirm)

A simulation never holds a signature, so it does what `sim:fork --as` does
for an ordinary transaction: it acts as the sender. Concretely:

- The sender's own VERIFY frame (target `null`) is **not run**: its
  approval is granted with the scope the frame asks for, and the frame's
  receipt says `impersonated`. On a sender without code the protocol would
  only have checked the secp256k1 signature; on a `FrameAccount` the check
  is the owner's EIP-712 signature (`verify(uint8)`), and both are what
  impersonation stands for.
- Every other VERIFY frame **runs**: a sponsor's `verify()` reads only
  `TXPARAM(SENDER)` and approves PAYMENT, so the simulation checks the
  sponsor really sponsors this sender, and a paymaster with other checks
  is checked the same way.
- The one signature entry is a placeholder (scheme SECP256K1, signer the
  sender or the `FrameAccount` owner, 65 zero bytes), so SIGPARAM and
  SIGDATACOPY answer, and a contract that verifies a signature outside the
  sender's VERIFY frame fails in the simulation as it would with a bad
  signature. The run says so in that error.

### What the run reports

The receipt is the `SyntheticReceipt` every in-process transaction returns
(synthetic hash, logs of every frame, balance changes over the whole
transaction, total gas), plus `payer` and `frameReceipts` in viem-frames'
shape (`status: success | reverted | skipped | impersonated`, `gasUsed`,
logs). Captures (`$> $tx`), relay scanning and `simulate({ suggest: true })`
then work as for any transaction.

`sim:fork` logs one line per frame that did not succeed, and one line per
body frame without `--gas`, giving the gas it used: that is the number to
write as `--gas`.

### What it does not model (stated in `sim/fork.md`)

- **Fees.** No in-process transaction pays a fee today, and a frame
  transaction does not either: the payer is reported, not charged. The
  simulation does not check that the payer can pay.
- **State gas (EIP-8037).** ethereumjs has no state gas. `STATE_GAS_LEFT`
  and `FRAMEPARAM(STATE_GAS_*)` answer from the limits, and state gas used
  is reported as unknown, not 0. A frame whose `--state-gas` is too small
  can pass in the simulation and fail on the devnet; the docs say so next
  to `--state-gas`.
- **Amsterdam transfer logs and state gas, measured.** On the local
  Kurtosis devnet (2026-11-08), a 1-wei value transfer to a new account
  logged an EIP-7708 `Transfer` from `0xff…fe` and used 183,600 state gas.
  The simulation emits no such log and measures no state gas, so suggested
  assertions must not rely on transfer logs from a frame transaction.
- **Mempool rules.** ERC-8421 admission rules (banned opcodes in an
  unstaked payer's validation, and so on) are the sidecar's, not the
  chain's, and are not checked.
- Keyed nonces other than key 0, recent roots, P256, deploy frames, POST_TX
  frames: the frames module does not produce them either.

## Tests

- **Unit (sim, ethereumjs backend, no network)**: each opcode handler
  against a hand-built context, with the helper runtimes from
  hegota-support's `yul/erc8421-workshop/` deployed in the fork. APPROVE:
  outside a VERIFY frame, from an account other than the target, with a
  scope the flags do not allow, and the frame ends right after it.
- **Integration (sim, fork of anvil, chain 1337 via the test transport)**:
  in one fork, `frames:new-account`, `frames:new-sponsor`, funding, and a
  `frames:tx --account … --paymaster …` whose body changes state, followed
  by `sim:expect`. Then each rule with a passing and a failing case: an
  atomic group rolled back with its later frames `skipped`; a failed body
  frame outside a group and the frames after it still running; a sponsor
  for another account refusing; a paymaster that returns without APPROVE.
  revm, anvil, hardhat and tenderly still refuse, and so does ethereumjs on
  a fork of a chain without frames (the existing `fork-frame.test.ts`
  moves to those cases).
- **Live, opt-in (`EVMCRISPR_FRAME_DEVNET=1`)**, against the local
  one-container devnet (`scripts/frame-devnet.ts up quick`, see
  `2026-11-08-frames-in-module-design.md`), not the public node: a parity test. For a few
  fixed transactions (self-pay, sponsored, an atomic group, a failing body
  frame), sign with a throwaway key, call `ethrex_simulateFrameTransaction`
  and compare each frame's status with the in-process run, and its gas
  within a stated margin. This is what notices when the devnet's rules
  move away from ours; the EIP is a draft.
- A test compares the copied constants with hegota-support's profile and
  enums.

## Steps

1. The opcode table and executor on ethereumjs, unit tests.
2. Receipt shape, logs, fork wiring and the per-backend refusals,
   integration tests.
3. The parity test against the devnet.
4. Docs: `sim/fork.md` (what is and is not modelled), the frame guide's
   "Combining with" Simulation entry, which today says `sim:fork` cannot
   run frames.

## Open questions for the owner

- **Impersonating the sender's VERIFY frame** (above), rather than running
  it. The alternative is to run it and fail without a signature, which
  makes every `frames:tx --account` fail in a simulation.
- **Where `SIG_HASH` comes from.** It is the devnet's RLP encoding with
  signatures elided, which hegota-support's `sigHash(profile, tx)`
  computes and viem-frames uses. Either sim takes
  `@forshtat/hegota-support` as an exact-pinned runtime dependency (MIT, a
  third party's 0.0.1 tied to a draft, shipped in a published module), or
  sim answers `SIG_HASH` with a fixed placeholder, which is enough while
  the only reader, `FrameAccount.verify`, is not run. The design leans to
  the placeholder for now, and the dependency if a run ever needs the real
  hash.
- **The fork's upstream for chain 1337.** viem's `localhost` is chain 1337
  too, so the frames module declares no chain (`modules/frames/src/chains.ts`),
  and the fork's upstream comes from the host's transport for 1337
  (`EVMCRISPR_RPC_URL_1337` in the CLI). Should `sim:fork --on 1337` default
  to the devnet's node, or keep asking the host? Not yet checked: that the
  ethrex node serves the reads the fork makes (`eth_getBalance`,
  `eth_getCode`, `eth_getTransactionCount`, `eth_getStorageAt` at a block;
  the backend avoids `eth_getProof`). The sandbox blocked the probe on
  2026-11-08; it is the first thing to check before step 2.
