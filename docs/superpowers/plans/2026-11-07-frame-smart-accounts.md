# Frame smart accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send `frame:tx` from a smart account authorized by one wallet (MetaMask) EIP-712 signature and paid by a sponsor, with the account and sponsor created by EVML commands, in the terminal (experimental) and the CLI.

**Architecture:** Two Solidity contracts ship as committed bytecode in the frame module. `frame:new-account` / `frame:new-sponsor` deploy them inline and bind the receipt's address. `frame:tx --account` marks its `FrameAction` with the account's owner; one viem-frames function turns such an action into a signed type-0x06 transaction by asking any wallet client for typed data, and both hosts call it.

**Tech Stack:** TypeScript, bun test, viem 2.56.8, `@forshtat/hegota-support` 0.0.1 (profile `ethrex-eip8141-tracer`, `Devnet.ERC8421_WORKSHOP`), solc-js 0.8.28 (dev only).

**Spec:** `docs/superpowers/specs/2026-11-07-frame-smart-accounts-design.md` (builds on `docs/superpowers/specs/2026-11-06-frame-tx-design.md`).

## Global Constraints

- Branch `frame-accounts` from `next`. Short single-line commit messages, no attribution. Do not regroup commits (owner, hackathon). `git add` explicit paths only; never the owner's unrelated files; never `git stash`.
- `@evmcrispr/core` and `@evmcrispr/sdk` do not depend on viem-frames or hegota-support. Std is unchanged.
- Chain 1337 is never a module chain. In the terminal it exists only when `VITE_PUBLIC_EXPERIMENTAL` is on.
- Typed data, exactly: domain `{ name: "EVMcrispr Frame Account", version: "1", chainId: 1337, verifyingContract: <account> }`, types `{ FrameTransaction: [{ name: "sigHash", type: "bytes32" }] }`, primaryType `"FrameTransaction"`, message `{ sigHash }`. The signature goes in signature entry 0, scheme `ARBITRARY` (0), signer `"0x"`, msg `"0x"`.
- Generated calls: the account's check `verify(uint8 scope)` (selector `0xb2225351`) with scope = the frame's approval bits (3 when the account pays, 2 with a paymaster), execution gas 40,000; the sponsor's `verify()` (selector `0xfc735e99`), execution gas 50,000.
- Deployments: explicit gas 6,000,000; contracts compiled with solc 0.8.28, optimizer on (200 runs), evm `cancun`.
- No signature is asked for a transaction whose frames differ from the reviewed action's (only nonce, fees and the generated check calls are added).
- Every wallet-, node- or gateway-supplied string that reaches a log or error is escaped (the CLI's `printable`, or hex-only for hashes).

## Review Focus

1. **The connected wallet is not the account's owner.** Expect a refusal naming the owner to connect, before any signature is asked. Test in Task 4 (`refuses when the wallet is not the account's owner, before signing`).
2. **`--account` names an address with no code** (an EOA, a typo). Expect a refusal before signing, not a VERIFY call into nothing. Test in Task 4 (`refuses an account with no code`).
3. **MetaMask's chain-1337 network is Localhost, not the devnet.** Expect the run to stop before any transaction, with the RPC to set. Test in Task 7 (`stops when the wallet's chain 1337 is not the gateway's`).
4. **`new-account` / `new-sponsor` without a wallet** (a static `validate`, a `sim:fork` block). Expect a clear error, not a predicted address. Test in Task 2 (`needs an execution context with a wallet`).
5. **An unfunded sponsor.** Expect the alt mempool's refusal to be shown, escaped, with the sponsor's address. Test in Task 4 (`shows the mempool's refusal for an unfunded sponsor`).

---

### Task 1: The two contracts, compiled and committed

**Files:**
- Create: `modules/frame/contracts/FrameAccount.sol`, `modules/frame/contracts/FrameSponsor.sol` (start from the spike sources: `/tmp/claude-1000/-home-sem-Projects-EVMcrispr/6d830bc7-6bd9-4d89-b655-0b0911b4be45/scratchpad/spike-account/FrameAccount.sol` and `FrameSponsor.sol`; copy them into the repo first, the scratchpad is temporary)
- Create: `modules/frame/scripts/build-contracts.ts` (compiles with hegota-support's `compileSolidity(name, source, { optimizer: true })`, writes the artifacts file)
- Create: `modules/frame/src/contracts/artifacts.ts` (generated, committed: `frameAccountAbi`, `frameAccountBytecode`, `frameSponsorAbi`, `frameSponsorBytecode`, all `as const`)
- Modify: `modules/frame/package.json` (devDependencies `@forshtat/hegota-support` `0.0.1`, `solc` `0.8.28`; script `"build:contracts": "bun scripts/build-contracts.ts"`)
- Test: `modules/frame/test/unit/contracts.test.ts`

**Interfaces:**
- Produces: `frameAccountAbi`, `frameAccountBytecode: Hex`, `frameSponsorAbi`, `frameSponsorBytecode: Hex` from `modules/frame/src/contracts/artifacts.ts`.
- Contract behaviour: exactly the spec's "Contracts" section (FrameAccount `owner()`, `domainSeparator()`, `receive()`, `verify(uint8)`; FrameSponsor `owner()`, `sponsored()`, `receive()`, `verify()`, `withdraw(address,uint256)`).

- [ ] **Step 1: Write the failing test** `the committed bytecode matches a fresh compile`: compile both sources with `compileSolidity(..., { optimizer: true })` and expect `bytecode` and `abi` to equal the committed ones; `the ABIs expose the spec's functions`: `verify(uint8)` selector `0xb2225351` on the account, `verify()` selector `0xfc735e99` on the sponsor.
- [ ] **Step 2: Run** `cd modules/frame && bun test test/unit/contracts.test.ts`. Expected: FAIL (artifacts missing).
- [ ] **Step 3: Implement** the sources, the build script and the generated artifacts (`bun run build:contracts`).
- [ ] **Step 4: Run** the test and `bun run type-check` at the root. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "frame: account and sponsor contracts"`.

### Task 2: `frame:new-account` and `frame:new-sponsor`

**Files:**
- Create: `modules/frame/src/commands/new-account.ts`, `new-account.md`, `new-sponsor.ts`, `new-sponsor.md`
- Create: `modules/frame/src/deploy.ts` (shared inline deployment)
- Test: `modules/frame/test/unit/new-commands.test.ts`

**Interfaces:**
- Consumes: Task 1's artifacts.
- `frame:new-account <variable> [--owner <address>]` (owner default `@me`). `frame:new-sponsor <variable> --for <address> [--fund <number>] [--owner <address>]` (owner default `@me`; `--fund` is the creation value in wei).
- Produces (`deploy.ts`): `deployInline(module, interpreters, initCode: Hex, value?: bigint): Promise<Address>`: sends `{ data: initCode, value, gas: 6_000_000n, chainId }` through `interpreters.actionCallback` (as `modules/giveth/src/utils/tx.ts` does), gets the receipt (the callback's result, or `getTransactionReceipt` by hash), throws unless `status === "success"` and `contractAddress` is set, returns `contractAddress`. Each command binds the variable with `module.bindingsManager.setBinding(variable, address, BindingsSpace.USER, true, undefined, true)` (as `contracts:deploy` does) and returns `[]`.
- Both deploy on the current chain and refuse any chain but 1337 (the contracts only work there), naming the chain with `chainLabel`.

- [ ] **Step 1: Write the failing tests**, interpreting scripts with a fake `actionCallback` that records the action and answers a receipt:
  - `new-account deploys a FrameAccount owned by @me and binds the receipt's address`: the action's `data` starts with `frameAccountBytecode` and ends with the ABI-encoded owner; `gas` is `6_000_000n`; `$account` equals the receipt's `contractAddress`.
  - `new-sponsor deploys a FrameSponsor for the account, funded with --fund`: `value` is the `--fund` amount; constructor args `(owner, for)`.
  - `binds the receipt's address, not a predicted one`: the fake receipt's address differs from `getContractAddress(sender, nonce)`; the binding is the receipt's.
  - `refuses a reverted deployment`.
  - `needs an execution context with a wallet` (Review Focus 4): no `actionCallback` → `/needs .*wallet/`.
  - `refuses a chain other than 1337`.
- [ ] **Step 2: Run** `cd modules/frame && bun test test/unit/new-commands.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `deploy.ts`, the two commands and their `.md` files (examples must pass `bun run validate-docs`), regenerate codegen.
- [ ] **Step 4: Run** the module tests and `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "frame: new-account and new-sponsor commands"`.

### Task 3: `frame:tx --account` and the generated check calls

**Files:**
- Modify: `packages/sdk/src/types/actions.ts` (`FrameAction.account?: { kind: "frame-account"; owner: Address }`), `modules/frame/src/commands/tx.ts`, `modules/frame/src/layout.ts`, `tx.md`
- Modify: `apps/evmcrispr-terminal/src/runs/action-summary.ts` only if the type change breaks it (it must still compile)
- Test: `modules/frame/test/unit/layout.test.ts`, `modules/frame/test/unit/commands.test.ts`

**Interfaces:**
- `frame:tx` gains `--account <address>`. With it, the block runs inside `withSender(module, account, …)` (`@evmcrispr/sdk`), `LayoutInput.sender` is the account, and the action carries `account: { kind: "frame-account", owner: await module.getConnectedAccount() }` (the wallet, i.e. `@me`; use the module's existing accessor for the connected account).
- Produces (`layout.ts`): `LayoutInput.accountChecks?: boolean`. When true: the generated self/only verify frame's `data` is `verify(uint8)` with its scope (3 or 2) and `gas` 40,000; when a `paymaster` is given without `paymasterData`, the pay frame's `data` is `0xfc735e99` and `gas` 50,000. Without `accountChecks` nothing changes (existing tests stay green).

- [ ] **Step 1: Write the failing tests**:
  - layout `account checks call verify(scope)`: self-pay → frame 1 data `0xb2225351…03`, gas 40,000; with paymaster → frame 1 `…02`, frame 2 data `0xfc735e99`, gas 50,000.
  - layout `explicit paymaster data still wins`.
  - commands `tx --account makes the account the sender and marks the action`: `from` is the account, `account.owner` is `TEST_ACCOUNT_ADDRESS`, `@sender` inside the block is the account and `@me` the wallet.
- [ ] **Step 2: Run** `cd modules/frame && bun test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement**; update `tx.md`.
- [ ] **Step 4: Run** the module tests and `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "frame: tx --account, with the account's and sponsor's checks"`.

### Task 4: One wallet-signed sender in viem-frames

**Files:**
- Modify: `packages/viem-frames/src/serializer.ts` (an `ARBITRARY` entry: `scheme: 0`, `signer: "0x"`, signature bytes as given)
- Create: `packages/viem-frames/src/account.ts`
- Move: `toFrameRequests` from `packages/cli/src/lib/frame-handler.ts` into `packages/viem-frames/src/frame-specs.ts` with a structural input type (no SDK import); the CLI re-imports it
- Test: `packages/viem-frames/test/unit/account.test.ts`

**Interfaces:**
- Produces (`frame-specs.ts`): `type FrameSpecLike = { mode: "verify"|"sender"|"default"; approve?: "execution"|"payment"|"both"; atomic?: boolean; target: Address|null; data: Hex; value: bigint; gas?: bigint; stateGas?: bigint }`; `toFrameRequests(frames: readonly FrameSpecLike[]): FrameRequest[]` (behaviour unchanged).
- Produces (`account.ts`):
  ```ts
  export const FRAME_ACCOUNT_DOMAIN_NAME = "EVMcrispr Frame Account";
  export function frameAccountTypedData(account: Address, sigHash: Hex): TypedDataDefinition;
  export async function sendAccountFrameTransaction(args: {
    wallet: WalletClient;            // any account type: json-rpc (MetaMask, --wallet-rpc) or local
    account: Address;                // the FrameAccount, tx.sender
    owner: Address;                  // must be the wallet's address
    frames: readonly FrameSpecLike[];
    mempool: "alt" | "canonical";
    transport?: Transport;           // gateway; default altMempoolDevnet's
    onLog?: (line: string) => void;
    receiptTimeoutMs?: number;       // default 120_000
  }): Promise<{ hash: Hash; receipt?: FrameTransactionReceipt }>;
  ```
  It: refuses if the wallet's address ≠ `owner` (Review Focus 1) or the account has no code (Review Focus 2); refuses any frame without limits (no sizing for accounts: message says to give `--gas` and `--state-gas`); fetches the account's pending nonce and the sidecar's fees; builds the transaction with one `ARBITRARY` entry; computes the sig hash; asks `wallet.signTypedData(frameAccountTypedData(account, sigHash))`; checks it recovers to `owner`; submits (`eth_sendFrameTransaction`, or raw for canonical); requires the returned hash to equal its own; waits for the receipt like the CLI handler (timeout → throws "admitted but not mined …").

- [ ] **Step 1: Write the failing tests** with a `custom` sidecar transport (as `test/unit/client.test.ts`) and a local-account wallet client standing in for MetaMask:
  - `asks the wallet for the frame account typed data and sends it in an ARBITRARY entry`: the typed data equals `frameAccountTypedData(account, sigHash)` with the Global Constraints values; the wire signature entry has scheme `0` and the 65-byte signature; the hash checks.
  - `refuses when the wallet is not the account's owner, before signing` (Review Focus 1).
  - `refuses an account with no code` (Review Focus 2).
  - `refuses frames without limits`.
  - `shows the mempool's refusal for an unfunded sponsor` (Review Focus 5): sidecar error text with an ESC is escaped and names the sponsor.
- [ ] **Step 2: Run** `cd packages/viem-frames && bun test test/unit`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** viem-frames and `packages/cli` tests and `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "viem-frames: send a frame transaction from a wallet-signed account"`.

### Task 5: The CLI sends account frame actions

**Files:**
- Modify: `packages/cli/src/lib/frame-handler.ts`, `packages/cli/src/commands/run.ts` (the frame handler is installed for `--wallet-rpc` runs too)
- Test: `packages/cli/test/frame-handler.test.ts`

**Interfaces:**
- Consumes: Task 4's `sendAccountFrameTransaction`, `toFrameRequests`; Task 3's `FrameAction.account`.
- Behaviour: an action with `account` goes to `sendAccountFrameTransaction` with the run's wallet client (`--wallet-rpc` client, or the local-key wallet whose `eth_signTypedData_v4` is confirmed by `confirmingAccount`); an action without `account` keeps today's local-key path (and is refused with `--wallet-rpc`, as a plain sender cannot sign type 0x06 there).

- [ ] **Step 1: Write the failing tests**: `an account action is signed as typed data and confirmed` (local key: the confirmation summary shows the typed data; one confirmation); `an account action through --wallet-rpc asks the external wallet` (a stub JSON-RPC wallet answering `eth_signTypedData_v4`); `a plain frame action with --wallet-rpc is refused with the reason`.
- [ ] **Step 2: Run** `cd packages/cli && bun test test/frame-handler.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `bun test` in `packages/cli` and `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "cli: send frame transactions from wallet-signed accounts"`.

### Task 6: The terminal sends and reviews account frame actions

**Files:**
- Modify: `apps/evmcrispr-terminal/package.json` (`@evmcrispr/viem-frames` workspace dependency), `src/runs/run-manager.ts` (`frame` handler), `src/runs/action-summary.ts`
- Create: `apps/evmcrispr-terminal/src/runs/frame-handler.ts`
- Modify `packages/ui` and the gallery only if the summary needs an element `ActionList` cannot show today (AGENTS.md "Terminal UI")
- Test: the terminal's run/summary tests (find the existing `action-summary` / handler tests under `apps/evmcrispr-terminal/test/` and add beside them)

**Interfaces:**
- Consumes: Task 4's `sendAccountFrameTransaction`; Task 3's `FrameAction.account`.
- `frame` handler: `gated(...)` as today; an action with `account` → `sendAccountFrameTransaction({ wallet: ctx.walletClient, account: action.from, owner: action.account.owner, frames: action.frames, mempool: action.mempool, onLog: ctx.onLog })`, `ctx.onSent(hash)`; without `account` → the core refusal (unchanged).
- Summary for an account frame action: title `Frame transaction from account <account>`; one line per frame (mode, scope, target, value, selector, limits); payer (the pay frame's target, else the account); the typed data to be requested (domain name, version, chain, verifying contract, `FrameTransaction(bytes32 sigHash)`), with every value escaped.

- [ ] **Step 1: Write the failing tests**: `routes an account frame action to the wallet-signed sender` (a mock wallet; the typed data is asked once); `still refuses a plain frame action`; `the summary shows frames, payer and typed data`.
- [ ] **Step 2: Run** the terminal tests (`cd apps/evmcrispr-terminal && bun test test/app` or the folder the existing tests use). Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the terminal tests, `test/app/ui-conventions.test.ts`, and `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "terminal: send and review frame transactions from accounts"`.

### Task 7: The terminal's chain 1337 (experimental)

**Files:**
- Modify: `apps/evmcrispr-terminal/src/config/rpc.ts` (chain 1337, `Alt-mempool devnet`, RPC `https://altmempoolgateway.forshtat.com/rpc`, only when `isExperimentalEnabled()`)
- Create: `apps/evmcrispr-terminal/src/wallet/alt-mempool-chain.ts`
- Modify: where the terminal asks the wallet to change chain: the `wallet` action handler for `wallet_switchEthereumChain` and the `prepareChain` hook passed to core (`src/runs/run-manager.ts`)
- Test: beside the existing wallet/run tests

**Interfaces:**
- Produces: `ensureAltMempoolChain(wallet: WalletClient, gateway?: string): Promise<void>`: when the target chain is 1337 and the flag is on, first `wallet_addEthereumChain` with the gateway (chain id `0x539`, name `Alt-mempool devnet`, native ETH), then switch, then compare `eth_getBlockByNumber("latest")` hashes from the wallet and from the gateway (allow the wallet to be at most a few blocks behind: compare the wallet's block hash against the gateway's block of the same number); on mismatch throw `Your wallet's chain 1337 is not the alt-mempool devnet: set its RPC to https://altmempoolgateway.forshtat.com/rpc` before any transaction.

- [ ] **Step 1: Write the failing tests**: `adds the gateway before switching to 1337`; `stops when the wallet's chain 1337 is not the gateway's` (Review Focus 3); `does nothing for other chains`; `chain 1337 is absent when the experimental flag is off`.
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the terminal tests and `bun run type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "terminal: chain 1337 for the alt-mempool devnet, checked"`.

### Task 8: Guide and the live demo run

**Files:**
- Modify: `apps/evmcrispr-website/src/content/docs/guides/frame-transactions.md` (section "From a smart account")
- Create: `packages/cli/test/frame-account-devnet.test.ts`
- Generated: reference docs (`bun run scripts/generate-docs.ts`)

- [ ] **Step 1: Write the live test**, skipped unless `EVMCRISPR_FRAME_DEVNET=1`: a throwaway key funded by the faucet runs the spec's demo script through `evmcrispr run --yes --experimental` with `EVMCRISPR_PRIVATE_KEY`, `EVMCRISPR_DEFAULT_CHAIN_ID=1337`, `EVMCRISPR_RPC_URL_1337=https://altmempoolgateway.forshtat.com/rpc`; assert the output has the admitted hash; if mined within the wait, the receipt's payer is the sponsor.
- [ ] **Step 2: Run** it once for real. Expected: PASS; record the hash.
- [ ] **Step 3: Write the guide section**: the two commands, `--account`, what MetaMask shows, the sponsor, the gas defaults (40,000 / 50,000; body frames need `--gas` and `--state-gas`), the MetaMask network note, experimental only. Every `evml` block passes `bun run validate-docs`.
- [ ] **Step 4: Run** `bun run scripts/generate-docs.ts`, `bun run validate-docs`, `bun run type-check`. Expected: no errors.
- [ ] **Step 5: Commit** `git commit -m "frame: smart-account guide and live demo run"`.
