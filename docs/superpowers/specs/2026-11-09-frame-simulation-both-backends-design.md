# Frame transactions in `sim:fork`, on ethereumjs and revm

Status: built 2026-11-09 (steps 1-4). Decided 2026-11-09 (owner: "include ethereumjs and revm work (plan
new specs if needed)"). Replaces the placement and the "revm keeps the
refusal" parts of `2026-11-08-frame-simulation-design.md`, whose rules,
opcode table, signatures and "what it does not model" sections stand.
Implements step 6 of `2026-11-08-frames-in-module-design.md`.

## Decisions

- **One executor, one meaning of each opcode, in TypeScript**, in
  `modules/frames/src/simulate/`. Both in-process backends run it through
  the same small host interface; neither knows EIP-8141. Checked against
  the code on 2026-11-09 (ethereumjs 10.1.3, revm 42.0.1): feasible on both.
- **The extension point is the SDK's**: a module action may have
  `simulate(action, sim)`, beside `describe` and `send`. `sim:fork` calls it
  with a `ModuleActionSimCtx` from its active backend. A backend without one
  (anvil, hardhat, tenderly) refuses the action, naming the backends that
  run it (`--using ethereumjs` or `--using revm`).
- **Only on a frame network** (the frames module's network table): a fork of
  any other chain refuses, since sending there fails.
- **The sender's own VERIFY frame is impersonated** (not run; receipt status
  `impersonated`), as `sim:fork --as` impersonates an ordinary sender. Other
  VERIFY frames run (a sponsor's check).
- **SIG_HASH is the real signature hash** (`sigHash` of the unsigned
  transaction, through viem-frames), with a placeholder signature entry
  (SECP256K1, 65 zero bytes): the frames module already depends on the
  library that computes it.
- **Gas.** A body frame without `--gas` runs with 30,000,000, and the fork
  logs, per such frame, the gas it used and the `--gas` to write. Sending
  still needs `--gas` on every call: sizing at send time would make the
  frames module create a fork of its own (a dependency on sim's backends).
  Recorded as the remaining gap of step 6.

## The host interface (SDK, no frames in it)

```ts
interface SimCallResult {
  success: boolean;        // false: reverted or halted
  returnData: Hex;
  gasUsed: bigint;         // execution gas only, no intrinsic gas
  logs: { address; topics; data }[];
  error?: string;          // the halt or revert, when not success
}
interface SimOpcode {
  opcode: number;          // the byte
  pops: number;            // stack operands, top first
  run(input: { address: Address; operands: bigint[]; isStatic: boolean }):
    | { push: bigint }
    | { write: { offset: bigint; data: Hex } }   // memory, gas charged by the host
    | { return: { offset: bigint; size: bigint } } // ends the frame like RETURN
    | { fail: string };                            // ends the frame like INVALID
}
interface ModuleActionSimCtx {
  chainId: number; blockNumber: bigint; timestamp: bigint;
  call(args: { caller; to; data; value; gas; isStatic }): Promise<SimCallResult>;
  checkpoint(): Promise<void>; commit(): Promise<void>; revert(): Promise<void>;
  getNonce(a): Promise<bigint>; setNonce(a, n): Promise<void>;
  getBalance(a): Promise<bigint>; getCode(a): Promise<Hex>;
  withOpcodes<T>(opcodes: SimOpcode[], run: () => Promise<T>): Promise<T>;
  transactionHash(): Hex;  // the fork's synthetic hash for this action
}
```

`call` runs one top-level call: no nonce change, no intrinsic gas, no
balance check for fees (value is still transferred). `run` is synchronous
and must be pure over the executor's context, except for what the executor
records itself (approvals), because revm may run a call again after a
state miss: the executor keeps a per-attempt buffer and applies it only
from the result of the attempt that finished.

## ethereumjs

The seven opcodes are installed once, when the VM is created
(`evmOpts.customOpcodes`), as closures over the table `withOpcodes` sets;
with none set they trap as an undefined opcode does. A copy charges memory
expansion (re-implemented, `subMemUsage` is not exported). `call` is
`evm.runCall` with `skipNonceIncrement` and `skipBalance`, inside the
journal the backend already uses; `checkpoint/commit/revert` are the
journal's.

## revm (WASM)

- **Instructions**: `Evm.instruction.insert_instruction` for the seven bytes
  when the call carries the frame flag. An instruction is a plain `fn`, so
  the host callback lives in a `thread_local!` set for one call. The wasm
  shell passes the JS `FrameHost` object (`opcode(op, operands) -> json`,
  wasm-bindgen `catch`, so a JS throw never unwinds through the fork and
  loses its cache); native tests use a Rust closure.
- **Static calls**: an Inspector sets `is_static` at depth 0.
- **Nonce and gas**: `transact` bumps the caller's nonce and charges
  intrinsic gas; the call undoes the nonce in the state before commit, and
  adds the intrinsic gas to the limit and subtracts it from gas used, so
  frames see the same gas as on ethereumjs.
- **Checkpoints**: an undo log in Rust (prior account info and slot values,
  read from the cache before each commit); revert restores them without
  dropping upstream data seeded meanwhile (re-fetching it would trip the
  replay loop's no-progress guard).
- Artifacts rebuilt with `bun scripts/build-wasm.ts`.

## The fork

`fork.ts`: a module action whose module has `simulate` and whose backend
gives a sim context runs; its receipt (the `SyntheticReceipt` plus `payer`
and `frameReceipts`) is recorded like any other (captures, relay scan,
suggestions). Otherwise the refusal names what is missing.

## Tests

- SDK/sim: a probe module whose `simulate` uses each part of the host, on
  both backends (the shared backend suites), and the refusal on anvil.
- Frames, unit: each opcode's meaning against a built context; the copied
  constants against hegota-support's profile.
- Frames, integration, both backends, a fork of an anvil started with chain
  id 81412: `frames:new-account`, `frames:new-sponsor`, funding and a
  sponsored `frames:tx --account` with `sim:expect` after it; a plain
  sender; an atomic group rolled back with later frames `skipped`; a failed
  body frame outside a group; a sponsor of another account refusing; a body
  frame without `--gas` logging its gas.
- Live, opt-in: parity with `ethrex_simulateFrameTransaction` on `up quick`
  (each frame's status; gas within a stated margin).

## Steps

1. SDK `simulate` + `ModuleActionSimCtx`; sim dispatch and refusals; the
   ethereumjs host.
2. The frames executor and opcodes, on ethereumjs; integration tests.
3. The revm host (Rust + wasm + TS); the same tests on revm.
4. Gas lines, parity test, docs (`sim/fork.md`, the frame guide).

## Built (2026-11-09)

- Both backends run the frames executor; revm through `RevmFork.frameCall`
  (custom instructions over a thread-local hook, an inspector giving the
  top-level call the frame's gas and static flag, an undo log for
  checkpoints). The inspector also removes the intrinsic-gas and EIP-7623
  floor questions: the transaction's limit is generous, the call gets the
  frame's gas exactly.
- Measured on `up quick`: a frame pays 100 to reach a warm target and 3000
  for a cold one, out of its own gas (`COLD_TARGET_GAS`); with it, the
  parity test matches ethrex exactly, frame by frame, on both backends.
- Remaining gap: sizing at send time (see Decisions); the fork's line gives
  the `--gas` to write.

## After review (2026-11-09)

- **Warm state is the transaction's, not the frame's** (measured on
  `up mining`): a slot read in one frame is warm in the next, and an address
  reached inside one frame's inner call is a warm target for the next. The
  host now carries it across an action's calls (`isWarm` / `warm`;
  ethereumjs: one journal, cleaned when the action starts; revm: each call
  gets what earlier calls touched as its access list), and the executor asks
  the host whether a target is warm. The parity test covers both cases.
- **The sender's nonce** is used once validation passes, from its current
  value; a body frame's CREATE keeps its own bump (revm undoes only its
  one transaction bump).
- **No value is made up**: a frame sending more than its caller has fails on
  both backends (revm's frame calls keep the balance check on).
- **An error unwinds every checkpoint** the executor opened.
- Left as they are (rulings): APPROVE ordering and a second payment approval
  are not checked (ethrex's rules unverified); a frame that fails reaching its
  target still warms it; a failure message of an opcode in a reverted inner
  call can label a later revert of the same frame.
