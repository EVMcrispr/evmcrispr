# `frames:post-verify` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frames:post-verify ( assert … / exec … )` inside `frames:tx` writes POST_TX frames on the Hegota devnet, sent as written, simulated in `sim:fork`, with EVMcrispr's assertions contracts deployed there.

**Architecture:** A frame mark `post-verify` (like `default`/`verify`) turns a block's `assert`/`exec` actions into trailing POST_TX frames; viem-frames maps the mode through the network's profile. The frame simulator runs them after the body with two added opcodes (TXTRACE, EVENTDATACOPY) answered from a record of the transaction's state changes and logs, which the sim context now exposes. Hegota's behaviour is measured first and the code follows the measurement.

**Tech Stack:** TypeScript (bun), viem, `@forshtat/hegota-support`, revm (Rust/wasm) and ethereumjs backends, Kurtosis-free (all live work is on the public Hegota devnet).

**Spec:** `docs/superpowers/specs/2026-11-09-post-verify-design.md`

## Global Constraints

- Command name: `post-verify` (`frames:post-verify`), a block `( … )`, inside `frames:tx` only; lines: `assert` and `exec` only.
- POST_TX mode comes from the network's profile: `frameModes.POST_TX` (3 on `ethrexHegotaDevnetProfile`); a network whose profile lacks it refuses `post-verify` by name before anything is signed.
- TXTRACE `0xb6` pops `param` then `in2`; EVENTDATACOPY `0xb7` pops `eventIndex`, `memOffset`, `dataOffset`, `length`. Both fail outside a POST_TX frame.
- TXTRACE param ids are Hegota's (the demo's `TxTraceLib`): `0x00` BALANCE_COUNT … `0x13` EVENT_DATA_LEN, exactly as listed in the spec's Constraints.
- No pre-flight: a `post-verify` transaction is sent as written; a drop is reported, never waited on forever.
- Live work on Hegota (`https://rpc1.hegota.ethrex.xyz`, chain 3151908) sends from anvil #0 (`0xf39F…2266`, key `0xac09…ff80`), which the owner agreed to.
- No sugar: no helper or command per check; the demo's contracts appear only in docs.
- Commits: `--no-verify` (repo-wide type-check hook), short single-line messages; final verification at the end (Task 9).

## Review Focus

- `post-verify` on any network but `hegotaDevnet` (a local devnet, the alt-mempool devnet) → refused by name before signing (Task 4 test).
- `post-verify` not last in the `frames:tx` block, written twice, or empty → refused with where it goes (Task 4 tests).
- A line that is neither `assert` nor `exec` inside `post-verify` (`send`, `batch`, `default`, `verify`) → refused by name (Task 4 test).
- A TXTRACE index ≥ the count, or a topic beyond an event's topic count → the POST_TX frame halts, not a crash of the simulator (Task 5 test).
- A body frame that reverted (alone or in a rolled-back group) → its logs and state changes are absent from TXTRACE (Task 5 test).

---

### Task 1: Measure Hegota's POST_TX behaviour

**Files:**
- Create: `modules/frames/test/devnet/hegota-post-tx-probe.devnet.test.ts` (opt-in, `EVMCRISPR_HEGOTA=1`; run once, kept as the record)
- Modify: `docs/superpowers/specs/2026-11-09-post-verify-design.md` (new section "Measured on Hegota")

**Interfaces:**
- Produces: the spec section "Measured on Hegota", which Tasks 4, 5 and 6 read: (a) a failing POST_TX frame: transaction excluded, or included with the body reverted (and the receipt's per-frame `status` values); (b) whether a POST_TX frame may carry the atomic flag, and whether the frame before one may; (c) TXTRACE: balance/storage/contract entries net or per write, their order, whether EIP-7708 transfer logs count as events, halt on an out-of-range index; (d) the caller of a POST_TX frame (entry point `0x…aa`?) and whether it is static.

- [ ] **Step 1: Write the probe test.** A raw-bytecode probe contract `TraceExpect` (deployed in the same transaction by a DEFAULT frame through the CREATE2 deployer `0x4e59…956C`): runtime reverts unless `TXTRACE(calldata[0..32] = param, calldata[32..64] = in2) == calldata[64..96]`. Each question is a frame transaction built with `toFrameRequests(..., ethrexHegotaDevnetProfile)` and judged with `simulate(HEGOTA_DEVNET_RPC, raw)` (`frames[i].succeeded` of the POST_TX frame), except (a), which needs one real send of a transaction whose POST_TX frame reverts, followed by `eth_getTransactionReceipt` polling for 60 s and `eth_getTransactionByHash`.
- [ ] **Step 2: Run** `EVMCRISPR_HEGOTA=1 bun test test/devnet/hegota-post-tx-probe.devnet.test.ts` in `modules/frames`. Expected: each probe logs its finding; the test passes by recording, not by asserting an outcome.
- [ ] **Step 3: Write the findings** into the spec's "Measured on Hegota" section (one line each, with the transaction hash for (a)).
- [ ] **Step 4: Commit** `git commit --no-verify -m "frames: Hegota's POST_TX behaviour, measured"`

### Task 2: EVMcrispr's assertions contracts on Hegota

**Files:**
- Create: `scripts/deploy-assertions.ts`
- Test: `scripts/test/deploy-assertions.test.ts`

**Interfaces:**
- Consumes: the Assertions repo's `website/src/lib/{assertions,operations,collections,expressions}-deployment.ts` (each exports `<PREFIX>_ADDRESS`, `<PREFIX>_SALT`, `<PREFIX>_CREATION_BYTECODE`), located by `ASSERTIONS_REPO` (default `../Assertions`); the SDK's `CORE_ADDRESS`, `OPERATIONS_ADDRESS`, `COLLECTIONS_ADDRESS`, `EXPRESSIONS_ADDRESS`; test-utils' `*_RUNTIME_HASH`.
- Produces: `deployCalldata(salt: Hex, creation: Hex): Hex` (`salt ‖ creation`); CLI `bun scripts/deploy-assertions.ts --rpc <url>`: deploys each missing contract through the CREATE2 proxy from anvil #0, skips one already there, refuses if the deployment module's address differs from the SDK's, and checks each runtime's keccak against test-utils' hash.

- [ ] **Step 1: Test** `deployCalldata` returns `concat([salt, creation])`, and that each module's predicted CREATE2 address (`getContractAddress({ opcode: "CREATE2", from: proxy, salt, bytecode })`) equals the SDK constant of the same contract.
- [ ] **Step 2: Run** `bun test scripts/test/deploy-assertions.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the script.
- [ ] **Step 4: Run** the test → PASS. Then `bun scripts/deploy-assertions.ts --rpc https://rpc1.hegota.ethrex.xyz` → four "deployed" (or "already there") lines, each with a matching runtime hash.
- [ ] **Step 5: Commit** `git commit --no-verify -m "scripts: deploy the assertions contracts on a chain; done on the Hegota devnet"`

### Task 3: viem-frames: the POST_TX mode and a dropped transaction

**Files:**
- Modify: `packages/viem-frames/src/frame-specs.ts`, `packages/viem-frames/src/send.ts`, `packages/viem-frames/src/index.ts`
- Test: `packages/viem-frames/test/unit/hegota.test.ts`, `packages/viem-frames/test/unit/send.test.ts`

**Interfaces:**
- Produces: `FrameSpecLike.mode` gains `"postTx"`, mapped to the profile's `POST_TX` (`toFrameRequests` throws `The frame profile has no postTx mode` without it); `class FrameTransactionDroppedError extends Error { hash: Hash }`, thrown by `submitFrameTransaction` when, while waiting for the receipt, the node answers `eth_getTransactionByHash` with `null` on two polls in a row (the transaction left the mempool unmined): message `${hash} was dropped: the node no longer has it and it was not mined`.

- [ ] **Step 1: Tests:** `toFrameRequests([{ mode: "postTx", … }], ethrexHegotaDevnetProfile)[0].mode === 3`; with the tracer profile it throws `The frame profile has no postTx mode`; a mocked gateway that admits the transaction, never returns a receipt and answers `eth_getTransactionByHash` with `null` makes `submitFrameTransaction` reject with `FrameTransactionDroppedError` within the receipt timeout.
- [ ] **Step 2: Run** `bun test` in `packages/viem-frames` → FAIL.
- [ ] **Step 3: Implement**; the drop poll runs beside `waitForTransactionReceipt` every few seconds (no busy loop).
- [ ] **Step 4: Run** → PASS (all 42 existing tests too).
- [ ] **Step 5: Commit** `git commit --no-verify -m "viem-frames: the postTx mode, and a transaction the node dropped"`

### Task 4: The `post-verify` command and its layout

**Files:**
- Create: `modules/frames/src/commands/post-verify.ts`, `modules/frames/src/commands/post-verify.md` (hand-written part)
- Modify: `modules/frames/src/marks.ts`, `modules/frames/src/frame-action.ts` (`FrameSpec.mode` gains `"postTx"`, the same name viem-frames uses, as for the other modes), `modules/frames/src/layout.ts`, `modules/frames/src/commands/tx.ts`, `modules/frames/src/describe.ts`, `modules/frames/src/networks.ts`
- Test: `modules/frames/test/unit/commands.test.ts`, `modules/frames/test/unit/describe.test.ts`

**Interfaces:**
- Consumes: Task 3's `"postTx"`; Task 1's finding (b).
- Produces: `FrameMark` gains `{ mode: "postTx" }`; layout emits `postTx` frames last, with `stateGas: 0n`, no `atomic`, execution gas from the line's `--gas` else `frames:tx --gas` (as body frames), and accepts a read-only action only when marked `postTx`; `isPostTxNetwork(chainId: number): boolean` in `networks.ts` (the network's profile has `POST_TX`).

- [ ] **Step 1: Tests** (each a `run(script, chainId)` as in `commands.test.ts`):
  - on 3151908, `tx ( exec A "f()" --gas 50000\n post-verify ( assert … \n exec B "g()" ) )` → frame modes `[verify, sender, postTx, postTx]`, the assert's frame targeting `CORE_ADDRESS`, both `postTx` frames with `stateGas` 0;
  - on 81412 and 1337: refused, message contains `post-verify runs only on the Hegota devnet`;
  - `post-verify` followed by another statement in the block, two `post-verify`, an empty one: refused, messages contain `post-verify goes last in frames:tx, once`, `post-verify needs at least one assert or exec`;
  - `post-verify ( send A --value 1 )`, `post-verify ( batch ( … ) )`, `post-verify ( default ( … ) )`: refused, `only assert and exec go inside post-verify`;
  - `post-verify` outside `frames:tx`: refused, `post-verify only works inside frames:tx`;
  - a plain `assert` in the body (outside `post-verify`): still refused, the message now ending `…: to check after everything, write it inside post-verify`;
  - if Task 1 found the atomic flag refused before a POST_TX frame: a `batch` as the last body statement before `post-verify` is refused, `a batch cannot come right before post-verify`;
  - `describe`: post-verify frames are steps labelled `post-verify · gas N`.
- [ ] **Step 2: Run** `bun run test:unit` in `modules/frames` → the new tests FAIL.
- [ ] **Step 3: Implement**; run `bun ../../packages/sdk/scripts/codegen.ts` in `modules/frames`.
- [ ] **Step 4: Run** → PASS; `bun run scripts/validate-docs.ts` from the root → 0 errors.
- [ ] **Step 5: Commit** `git commit --no-verify -m "frames: post-verify, the transaction's last frames"`

### Task 5: The trace in the sim context, and POST_TX frames in the frame simulation

**Files:**
- Modify: `packages/sdk/src/utils/defineAction.ts` (`ModuleActionSimCtx`), `modules/sim/src/lib/revm-backend.ts`, `modules/sim/rust/src/exec.rs` (+ `lib.rs`, wasm rebuilt with `bun run build:wasm` in `modules/sim`), `modules/sim/src/lib/ethereumjs-backend.ts`, `modules/frames/src/simulate/simulate.ts`, `modules/frames/src/simulate/opcodes.ts`
- Create: `modules/frames/src/simulate/trace.ts`
- Test: `modules/sim/test/unit/backend-suite.ts`, `modules/sim/rust/tests/exec.rs`, `modules/frames/test/unit/simulate.test.ts`, `modules/frames/test/unit/simulate-opcodes.test.ts`, `modules/frames/test/integration/hegota.test.ts`

**Interfaces:**
- Consumes: Task 4's `postTx` frames (mode = profile `POST_TX`); Task 1's findings (a), (c), (d).
- Produces:
  - `ModuleActionSimCtx.stateChanges(): Promise<SimStateChanges>`, net changes since the first `checkpoint()` made through this context: `interface SimStateChanges { balances: { address: Address; before: bigint; after: bigint }[]; slots: { address: Address; slot: Hex; before: Hex; after: Hex }[]; codes: { address: Address; before: Hex; after: Hex }[] }` (code hashes), each list sorted ascending by address, slots then by slot.
  - `trace.ts`: `buildTrace(changes: SimStateChanges, logs: { address: Hex; topics: Hex[]; data: Hex }[]): FrameTrace` and `txtrace(trace: FrameTrace, param: bigint, in2: bigint): SimOpcodeResult` (Hegota numbering), `eventDataCopy(trace: FrameTrace, eventIndex: bigint, memOffset: bigint, dataOffset: bigint, length: bigint): SimOpcodeResult` (`{ write }`, `{ fail }` out of range).
  - `frameOpcodes(ctx)` adds TXTRACE/EVENTDATACOPY when `ctx.profile.frameModes.POST_TX !== undefined`; they `fail` unless the running frame's mode is `POST_TX`.

- [ ] **Step 1: Tests:**
  - backend suite, both backends: after a checkpoint, a transfer of 4 wei and an `SSTORE` → `stateChanges()` lists the two balances (before/after) and the slot, sorted; a slot written twice appears once with the first `before`; nothing listed for an account only read;
  - Rust: the same at the `Fork` level if the change lives there;
  - `trace.ts` unit: counts, each param, an index ≥ count → `{ fail }`, a missing topic → `{ fail }`, EVENTDATACOPY past the data → `{ fail }`;
  - `simulate.test.ts` (fake host, chain 3151908): POST_TX frames run after the body as static calls from the entry point; a body frame that reverted contributes no logs; a failing POST_TX frame does what Task 1 (a) measured (the simulation throws `The frame transaction is invalid: post-verify frame N failed (…)` if excluded; otherwise the body is rolled back and the POST_TX receipt has status `reverted`);
  - integration (`hegota.test.ts`, both backends, the anvil stand-in on 3151908): a POST_TX frame calling a raw-bytecode check that reverts unless `TXTRACE(BALANCE_COUNT, 0) >= 2` passes after a transfer; one requiring an event with the ERC-20 `Transfer` topic fails when none was emitted.
- [ ] **Step 2: Run** the suites (`bun test ./test/unit` in `modules/sim`, `cargo test` in `modules/sim/rust`, `bun run test:unit` and `bun ../../scripts/run-integration-tests.ts frames` in `modules/frames`) → FAIL.
- [ ] **Step 3: Implement**: the frame simulator captures `stateChanges()` and the surviving body logs once the body has run, builds the trace, then runs the POST_TX frames with it.
- [ ] **Step 4: Run** → PASS, every existing test included.
- [ ] **Step 5: Commit** `git commit --no-verify -m "sim, frames: POST_TX frames simulated, with TXTRACE and EVENTDATACOPY"`

### Task 6: Sending: a dropped or failed `post-verify` transaction is reported

**Files:**
- Modify: `modules/frames/src/send.ts`
- Test: `modules/frames/test/unit/send.test.ts`

**Interfaces:**
- Consumes: Task 3's `FrameTransactionDroppedError`; Task 1 (a).
- Produces: for a transaction with post-verify frames, a drop becomes `Error("A post-verify check failed: the chain dropped the transaction <hash>" + (frame ? ` (post-verify frame N: <reason>)` : ""))`, the frame named from `simulate(chain's simulation URL, raw)` when the node says which POST_TX frame fails; a mined receipt whose POST_TX frame failed is reported as failed naming that frame. A drop of a transaction without post-verify frames keeps viem-frames' message.

- [ ] **Step 1: Tests** with the fake gateway of `test/helpers/frame-gateway.ts`: dropped with post-verify → the message above, frame named; dropped without → viem-frames' message; (per Task 1 (a)) a receipt with a failed POST_TX frame → failed, frame named.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit --no-verify -m "frames: a post-verify transaction the chain dropped is reported"`

### Task 7: Live on Hegota

**Files:**
- Create: `modules/frames/test/devnet/hegota-post-verify.devnet.test.ts` (opt-in, `EVMCRISPR_HEGOTA=1`, run by `test:hegota`)
- Modify: `modules/frames/package.json` (`test:hegota` runs every `hegota*.devnet.test.ts`)

**Interfaces:**
- Consumes: Tasks 2–6.

- [ ] **Step 1: Write the tests**, each an EVML script sent from anvil #0 through a wallet client signing type 0x06 (as `plain.devnet.test.ts` does):
  - `post-verify ( assert @balance!(ETH 0x…dEaD) >= 1 )` after a transfer → mined, every frame success;
  - the same with `>= 10e18` → reported as Task 6 says (dropped or failed), naming the check;
  - `post-verify ( exec 0x643DfBbbA8a30f9b2e79c5b0B3589106E2fd8DbF "assertExactBeneficiary(address)" 0x…dEaD )` after a transfer to `0x…dEaD` → mined;
  - the same with another expected beneficiary → reported as failed/dropped;
  - each also simulated first with `sim:fork --on hegotaDevnet` (both backends): the fork agrees with the chain on pass/fail.
- [ ] **Step 2: Run** `bun run test:hegota` in `modules/frames` → PASS.
- [ ] **Step 3: Commit** `git commit --no-verify -m "frames: post-verify live on the Hegota devnet"`

### Task 8: Docs

**Files:**
- Modify: `apps/evmcrispr-website/src/content/docs/guides/frame-transactions.md` (section "Checks after everything: post-verify", with the address-book table), `modules/frames/src/commands/post-verify.md`, `modules/frames/src/commands/tx.md`, `modules/sim/src/commands/fork.md` (POST_TX in the fork, EIP-7708 logs not modelled)

- [ ] **Step 1: Write** the guide section: what `post-verify` does, sent as written (no check before signing; `sim:fork` previews), what a failure does on Hegota (Task 1 (a)), and the table of the demo's contracts — `RequiredEventAssertion 0x0c1fA596B6ADA68deB19F67B15f5B99eA43B9C13 assertRequiredEvent(bytes32,uint256)`, `MinOutputAssertion 0xCFdC6239C460bb544EcC1F6A90Cb02Bce4168B01 assertMinOutput(address,address,(uint8,bytes))`, `ApprovalCapAssertion 0x4826b1e49828b50b7c78dC61C928cf52773E62Df assertApprovalCap(address,address,(uint8,bytes))`, `ExactBeneficiaryAssertion 0x643DfBbbA8a30f9b2e79c5b0B3589106E2fd8DbF assertExactBeneficiary(address)`, `ProxyIntegrityAssertion 0x42D1F899aBcdd79ADf8620e7b8008010093D9691 assertNoImplementationChange()`, `SafeControlPlaneAssertion 0x83519C0497d582e3687B21F3b60998eA8060fB7D assertSafeControlPlaneUnchanged(address)` — each with what it checks (from its contract's notice) and the code checked live before writing (`eth_getCode` non-empty).
- [ ] **Step 2: Run** `bun run scripts/generate-docs.ts`, then `bun run scripts/validate-docs.ts` → 0 errors.
- [ ] **Step 3: Commit** `git commit --no-verify -m "docs: post-verify and the hegota demo's checks"`

### Task 9: Final verification

- [ ] **Step 1: Run** from the root: `bun run type-check`, `biome check .`, `bun test:unit`, `bun scripts/run-integration-tests.ts frames sim`, `bun run scripts/validate-docs.ts`, and `bun run test:hegota` in `modules/frames`. Expected: all pass.
- [ ] **Step 2:** Mark the spec's status "built" and commit `git commit --no-verify -m "spec: post-verify built"`. Do not push; regroup with the branch's other commits only when the owner asks.
