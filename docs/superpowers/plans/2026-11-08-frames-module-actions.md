# Module actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A module owns the actions it produces (how they are described and sent); `frames:tx` returns one, and the terminal's frame handler is replaced by the frames module's `send`, with behaviour unchanged (account senders only).

**Architecture:** The SDK gains one generic `Action` member, `ModuleAction` (`type: "module"`, `module`, `kind`, `chainId`, `from`, `data`, `description`), and `defineAction` for a module's `static readonly actions`. The description is computed by the module when the action is made and travels with it, so any host can show it; sending needs the module: core's default `module` handler loads it through the run's registry and calls its `send`. The worker client's main-thread registry gets the host's module entries. `FrameAction`/`FrameSpec` leave the SDK for `modules/frames`.

**Tech Stack:** TypeScript, bun test, viem, `@evmcrispr/viem-frames`.

**Spec:** `docs/superpowers/specs/2026-11-08-frames-in-module-design.md`, section 1 and step 1 (section 2 for what `send` keeps; its plain-sender, network-table and gas parts are step 3, not this plan).

## Global Constraints

- No raw chain ids in user-facing messages: name chains with `chainLabel` (sdk) or the chain's name.
- `@evmcrispr/viem-frames` stays free of EVML/EVMcrispr wording; EVML hints live in the module.
- The terminal escapes every value it shows from an action (`escaped`), including a module's description.
- Commits: one short line, no attribution. Never `git stash`. Work in `.claude/worktrees/frame-accounts`, branch `frame-accounts`; no pushes.
- After a module's `src/` changes, run its codegen (`bun packages/sdk/scripts/codegen.ts` from the module dir) and `bunx turbo run types` if dist types go stale.
- Lint with `bunx biome check apps packages modules scripts` (`biome check .` skips `.claude/` worktrees).

## Review Focus

1. A module action reaching a host whose registry lacks (or hides, experimental off) its module: a named error, never a silent success. Pinned in Task 2.
2. A module action whose `kind` the module does not define: a named error. Pinned in Task 2.
3. A module action inside `sim:fork`: refused, never dropped as if it had run. Pinned in Task 3.
4. A description string carrying invisible or control characters from the script: the terminal shows them escaped. Pinned in Task 4.
5. The bigint values in `data` crossing the worker boundary: they arrive as bigints at `send`. Pinned in Task 2.

---

### Task 1: SDK module actions

**Files:**
- Modify: `packages/sdk/src/types/actions.ts` (add `ModuleAction`, `isModuleAction`, add to `Action`)
- Create: `packages/sdk/src/utils/defineAction.ts`
- Modify: `packages/sdk/src/types/modules.ts:389-398` (`IModuleConstructor.actions?`)
- Modify: `packages/sdk/src/index.ts` (exports)
- Test: `packages/sdk/test/unit/module-actions.test.ts`

**Interfaces:**
- Produces:
  - `interface ModuleActionCall { to: Address; data: Hex; value: bigint }`
  - `interface ModuleActionDescription { title: string; detail: string; meta: string; warning?: string; steps: { label: string; call?: ModuleActionCall }[]; notes: string[] }`
  - `interface ModuleAction<D = unknown> { type: "module"; module: string; kind: string; chainId: number; from: Address; data: D; description: ModuleActionDescription }`
  - `isModuleAction(action: Action): action is ModuleAction`
  - `interface ModuleActionSendCtx { walletClient: WalletClient; getPublicClient(chainId?: number): PublicClient; onLog(message: string): void; signal?: AbortSignal; transports?: Record<number, Transport>; onSent?(hash: Hash): void }` (structurally a subset of core's `ActionHandlerCtx`, so core passes its ctx as is)
  - `interface ModuleActionDef<D> { describe(action: Omit<ModuleAction<D>, "description">): ModuleActionDescription; send(action: ModuleAction<D>, ctx: ModuleActionSendCtx): Promise<unknown> }`
  - `defineAction<D>(module: string, kind: string, def: ModuleActionDef<D>): ModuleActionDef<D> & { module: string; kind: string; create(fields: { chainId: number; from: Address; data: D }): ModuleAction<D> }` — `create` fills `type`, `module`, `kind` and `description: def.describe(...)`.
  - `IModuleConstructor.actions?: Record<string, ModuleActionDef<any>>` (keyed by kind)

- [ ] **Step 1: Write the failing test** `module-actions.test.ts`:
  - `"create() makes a module action described by its module"`: a `defineAction<{ n: bigint }>("probe", "ping", { describe: (a) => ({ title: \`ping ${a.data.n}\`, detail: "d", meta: "m", steps: [], notes: [] }), send: async () => "sent" })`; `create({ chainId: 100, from: A, data: { n: 7n } })` equals `{ type: "module", module: "probe", kind: "ping", chainId: 100, from: A, data: { n: 7n }, description: { title: "ping 7", … } }`.
  - `"isModuleAction tells a module action from the others"`: true for the created one; false for `{ type: "batched", … }`, for a transaction action `{ to, data }`.
- [ ] **Step 2: Run** `cd packages/sdk && bun test test/unit/module-actions.test.ts` — Expected: FAIL, `defineAction` not exported.
- [ ] **Step 3: Implement** the Produces block. `FrameAction` stays in the union for now (Task 3 removes it).
- [ ] **Step 4: Run** the test and `bunx tsc --noEmit -p packages/sdk` — Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `sdk: actions a module owns, described when made`

### Task 2: Core dispatch of module actions

**Files:**
- Modify: `packages/core/src/evml/execute.ts` (`ActionHandlers.module`, default handler, `runDefault`)
- Modify: `packages/core/src/worker/client.ts` (`WorkerEvmlClientConfig.modules?: ModuleInput[]`, registered into the main-thread `ModuleRegistry` handed to `executeScript`)
- Test: `packages/core/test/unit/evml/execute-module-action.test.ts`, extend `packages/core/test/unit/evml/worker.test.ts`

**Interfaces:**
- Consumes: Task 1's `ModuleAction`, `IModuleConstructor.actions`.
- Produces: `ActionHandlers.module(action: ModuleAction, ctx: ActionHandlerCtx): Promise<unknown>`; `WorkerEvmlClientConfig.modules`; a test module `packages/core/test/unit/evml/fixtures/probe-module.ts` (`probe:ping <n>` returns `pingAction.create(...)`, `send` records the action and returns `{ status: "success", transactionHash: "0x…01" }` and calls `ctx.onSent`).

The default handler: `const loader = registry.get(action.module)`; none → throw `` `No module "${module}" is loaded here to send its ${kind} actions: this host cannot send them` ``; `(await loader()).default.actions?.[action.kind]` none → `` `The ${module} module has no "${kind}" action to send` ``; else `def.send(action, ctx)`. `makeDefaultHandlers` takes the registry in its env (`ExecutorEnv.registry?: ModuleRegistry`); without one, the first error.

- [ ] **Step 1: Write the failing tests** in `execute-module-action.test.ts`, each running `executeScript("load probe\nprobe:ping 7", registry, …)` with the probe module registered:
  - `"the module sends its action"`: the probe's `send` got the action with `data.n === 7n`; `executed[0].result` is its return value.
  - `"a wrapping handler gates it and passes it on"`: `handlers.module` records the action, then `ctx.next(action)`; both the wrapper and `send` saw it, in that order.
  - `"a host without the module refuses it by name"`: `makeDefaultHandlers({ account, maximizeGasLimit: false }).module(action, ctx)` rejects with `No module "probe" is loaded here to send its ping actions`.
  - `"an unknown kind is refused by name"`: action with `kind: "pong"` → `The probe module has no "pong" action to send`.
  - `"$> $tx captures what send returned"`: `probe:ping 7 $> $tx` then `print $tx`… use the capture form the existing `actionCallback.test.ts` uses for a transaction receipt; the captured value's hash is the probe's.
  - in `worker.test.ts`, `"a module action crosses the worker and is sent by the main thread's module"`: worker evml with `modules: [probeEntry]`; the main-thread `send` receives `data.n` as the bigint `7n`.
- [ ] **Step 2: Run** `cd packages/core && bun test test/unit/evml/execute-module-action.test.ts test/unit/evml/worker.test.ts` — Expected: FAIL (`module` handler missing).
- [ ] **Step 3: Implement** the Produces block; `frame` stays until Task 3.
- [ ] **Step 4: Run** the same tests and `bun test` in `packages/core` — Expected: PASS.
- [ ] **Step 5: Commit** `core: send a module's actions through the module`

### Task 3: The frames module owns its frame action

**Files:**
- Create: `modules/frames/src/frame-action.ts` (`FrameSpec`, `FrameActionData { frames: FrameSpec[]; mempool: "alt" | "canonical"; account?: { kind: "frame-account"; owner: Address } }`, `type FrameModuleAction = ModuleAction<FrameActionData>`)
- Create: `modules/frames/src/actions.ts` (`frameAction = defineAction<FrameActionData>("frames", "frame", { describe, send })`, `export const actions = { frame: frameAction }`)
- Create: `modules/frames/src/send.ts` (`sendFrameAction(action, ctx)`: today's `apps/evmcrispr-terminal/src/runs/frame-handler.ts` body; the gateway is `ctx.transports?.[action.chainId]`, else viem-frames' default)
- Create: `modules/frames/src/describe.ts` (`describeFrameAction`: today's `describeAccountFrames` + plain-frame branch of `apps/evmcrispr-terminal/src/runs/action-summary.ts`, host-neutral: raw `call`s, no escaping, no chain lookup)
- Modify: `modules/frames/src/index.ts` (`static readonly actions = actions`), `modules/frames/src/commands/tx.ts`, `modules/frames/src/layout.ts` (types from `frame-action.ts`)
- Modify: `packages/sdk/src/types/actions.ts`, `packages/sdk/src/index.ts` (remove `FrameAction`, `FrameSpec`, `isFrameAction`)
- Modify: `packages/core/src/evml/execute.ts` (remove `frame`); delete `packages/core/test/unit/frame-action.test.ts`
- Modify: `modules/sim/src/commands/fork.ts:420` (refuse every module action)
- Test: `modules/frames/test/unit/send.test.ts` (moved from `apps/evmcrispr-terminal/test/runs/frame-handler.test.ts`), `modules/frames/test/unit/describe.test.ts` (the frame cases moved from `apps/evmcrispr-terminal/test/runs/action-summary.test.ts`), `modules/frames/test/unit/commands.test.ts`, the sim refusal test that exists for frames (grep `cannot simulate frame`)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `actions` (module static), `FrameActionData`, `FrameSpec` exported from `@evmcrispr/module-frames`; `describeFrameAction(action): ModuleActionDescription`.

Rulings this plan makes (record them in the ledger as made):
- A plain sender's frame action is refused by the module: `A frame transaction from a plain address cannot be sent yet: send it from a frame account (frames:tx --account)`. It was core's refusal; the CLI now sends a frame account's transaction with its `--wallet-rpc` wallet (spec section 1: the default handler sends what a module owns).
- `sim:fork` refuses any module action: `` `sim:fork cannot simulate ${module}'s ${kind} actions yet: they would not run in the fork. Move them out of it.` `` (step 6 adds the extension point).

- [ ] **Step 1: Move the tests first.** `send.test.ts`: the terminal's frame-handler cases, calling `frameAction.send(action, ctx)` with the gateway as `ctx.transports[1337]` (the `frameGateway()` helper moves to `modules/frames/test/helpers/frame-gateway.ts`); plus `"a plain sender is refused"` with the text above. `describe.test.ts`: the action-summary frame cases against `describeFrameAction`, asserting raw (unescaped) strings. `commands.test.ts`: `frames:tx` returns `{ type: "module", module: "frames", kind: "frame", data: { frames, mempool, account } }` with a description whose title is `Frame transaction from account <address>`. Sim: `frames:tx` inside `sim:fork` rejects with `sim:fork cannot simulate frames's frame actions yet`.
- [ ] **Step 2: Run** `cd modules/frames && bun test test/unit` and the sim test — Expected: FAIL (no `actions`, `frames:tx` returns `type: "frame"`).
- [ ] **Step 3: Implement** the files above; delete the SDK's frame types and core's `frame` handler; fix every importer the type-check names.
- [ ] **Step 4: Run** frames unit, `bun run test:integration` for frames, the sim test, and `bunx turbo run type-check` — Expected: PASS. The opt-in devnet test still passes with `EVMCRISPR_FRAME_DEVNET=1` (it imports `layout` and `account`, not the SDK types).
- [ ] **Step 5: Commit** `frames: the module owns its frame action, described and sent by it`

### Task 4: The terminal sends and reviews module actions

**Files:**
- Delete: `apps/evmcrispr-terminal/src/runs/frame-handler.ts`, `apps/evmcrispr-terminal/test/runs/frame-handler.test.ts`
- Modify: `apps/evmcrispr-terminal/src/runs/run-manager.ts:531-534` (`module: gated(pass)`; `frameGateway` stays only for `ensureAltMempoolChain`)
- Modify: `apps/evmcrispr-terminal/src/runs/handlers.ts:14-21` (`reachesWallet`: `"module"` replaces `"frame"`)
- Modify: `apps/evmcrispr-terminal/src/runs/action-summary.ts` (a module action is shown from `action.description`: every string escaped, each step's `call` through `describeCall` with the action's chain; `FRAME_ACCOUNT_DOMAIN_NAME` and `framePayer` leave)
- Modify: `apps/evmcrispr-terminal/src/runs/worker.ts` (`modules: moduleEntries` from `@evmcrispr/modules`)
- Modify: `apps/evmcrispr-terminal/test/helpers/frame-gateway.ts`, `apps/evmcrispr-terminal/test/runs/run-manager.test.ts` (the gateway reaches the run as its transport for chain 1337), `apps/evmcrispr-terminal/test/runs/action-summary.test.ts`, `apps/evmcrispr-terminal/test/runs/handlers.test.ts`

**Interfaces:**
- Consumes: Task 3's `frameAction.create`, `ModuleAction`.

- [ ] **Step 1: Write the failing tests:**
  - `action-summary.test.ts` `"a module action is shown as its module describes it, escaped"`: a probe module action whose description title holds `"a‮b"` and one step with a call; the summary's title shows `a\u{202E}b`, its step's `call` is decoded (`to` and `value` as `describeCall` gives them), `notes` kept.
  - `handlers.test.ts` `"a module action reaches the wallet"`: `reachesWallet(frameAction.create(...)) === true`.
  - `run-manager.test.ts`: the existing frame-account run passes with the frame action now a module action and sent by the module (review held, then sent through the gateway).
- [ ] **Step 2: Run** `cd apps/evmcrispr-terminal && bun test test/runs` — Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `bun test test/runs test/app` (includes `foreign-writers` and `ui-conventions`), `bunx turbo run type-check`, biome, `bun run test:unit` — Expected: PASS.
- [ ] **Step 5: Commit** `terminal: send and review module actions; the frame handler goes`
- [ ] **Step 6: Docs.** AGENTS.md "Key Patterns" gains: actions a module owns (`src/actions.ts`, `defineAction`, `static readonly actions`, described when made, sent through core's `module` handler). The frames guide's line on where frame transactions can be sent says the CLI sends a frame account's with `--wallet-rpc`. Run `bun run scripts/validate-docs.ts`. Commit `docs: actions a module owns`.
