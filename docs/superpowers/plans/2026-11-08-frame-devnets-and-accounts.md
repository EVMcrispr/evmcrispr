# Frame devnets and frame accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One script that starts a local frame devnet (quick or mining) with anvil's accounts funded, and a second-generation frame account (one implementation, a CREATE2 factory, clones, an ERC-7579 surface, ERC-7739 signatures) proven end to end on the mining devnet.

**Architecture:** `scripts/frame-devnet.ts` derives everything at run time (the chain-9 genesis is read out of the pinned image and extended; the Kurtosis config is written from an object), so nothing third-party is vendored. The frames module compiles its contracts through its own small solc wrapper that resolves both `@forshtat/hegota-support` and `@openzeppelin/contracts`; the account's validation stays the EIP-712 check the module already signs for. viem-frames learns to send on any frame chain and through the canonical mempool without a sidecar, still without any EVML.

**Tech Stack:** Bun, TypeScript, viem 2.56, solc 0.8.28 (solc-js), `@openzeppelin/contracts` 5.6.1, `@forshtat/hegota-support` 0.0.1, Docker (`ghcr.io/forshtat/eip8141-devnet`), Kurtosis 1.20 + `ethpandaops/ethereum-package`.

**Spec:** `docs/superpowers/specs/2026-11-08-frames-in-module-design.md`, sections 6 (local devnets) and 7 (frame accounts: a CREATE2 factory and ERC-7579). Read section 7 before Task 3.

## Global Constraints

- The devnet keys are anvil's: mnemonic `test test test test test test test test test test test junk`, path `m/44'/60'/0'/0/i`, i = 0..9, derived in code (viem `mnemonicToAccount`), never written out. Each funded with `1000000 ETH` (`0xd3c21bcecceda1000000`).
- Quick devnet image pinned by digest: `ghcr.io/forshtat/eip8141-devnet@sha256:c9a7770f892e02255999e1c0ffd596ecee704d9175c2480811ccdcfa1c2224c6`; flags `--network <genesis> --http.addr 0.0.0.0 --http.port 8545 --http.api eth,net,web3,ethrex,debug,txpool`; **never `--dev`** (its block producer cannot drive Hegota and shuts the node down). Chain id 9. Never mines.
- Mining devnet: EL image `ghcr.io/forshtat/ethrex:eip8141-tracer-latest` tagged `ethrex:local`; `github.com/ethpandaops/ethereum-package@b5b3af65248f11702216e377d0377bcd8ccf4caf`; CL `ethpandaops/lighthouse:focil`, `validator_count: 32`, `supernode: true`; `el_extra_params: ["--http.api=ethrex", "--http.api=debug", "--http.api=txpool"]`; `seconds_per_slot: 6`, `fulu_fork_epoch: 0`, `gloas_fork_epoch: 1`, `heze_fork_epoch: 2`; `ethereum_genesis_generator_params.image: ethpandaops/ethereum-genesis-generator:6.1.6`; the EIP-8282 inhibitor preload at `0x0000BFF46984E3725691FA540A8C7589300D8282` (code and slot 0 as in `forshtat/mempool-workshop-sidecar:test/e2e/kurtosis/eip8141-single-node.yaml`). Chain id 3151908. Frames valid from epoch 2 (about 7 minutes).
- Ports: quick devnet on `EVMCRISPR_FRAME_DEVNET_PORT` (default 8556); the Kurtosis enclave is `evmcrispr-frames`, its RPC read with `kurtosis port print evmcrispr-frames el-1-ethrex-lighthouse rpc`. Never 8545..8560 for Kurtosis (the anvil test ports).
- Deterministic deployer: `0x4e59b44847b379578588920cA78FbF26c0B4956C` (present on both local devnets and on the gnosis anvil fork). Implementation and factory are deployed through it with salt `0x00…00`.
- EIP-712 domain unchanged: name `EVMcrispr Frame Account`, version `1`, the chain id, `verifyingContract` = the account. `accountId()` returns `evmcrispr.frame-account.2.0.0`.
- `isValidSignature` is ERC-7739 (OpenZeppelin's `ERC7739`) over the owner's ECDSA signature.
- Accounts deployed before the factory (v1) are devnet leftovers: no support, no migration (owner, 2026-11-08).
- viem-frames stays free of EVML and EVMcrispr (errors, logs, README): no `--flags`, command names or `:marks:`.
- Commits: one short line, no `Co-Authored-By`. Nothing is pushed (owner: "no pushes yet"). The pre-commit hook type-checks the whole repo; with `--no-verify` per task, run the final verification in Task 6.

## Review Focus

1. **The canonical mempool may refuse the clone's validation** (a delegatecall to the implementation, `EXTCODECOPY` of itself, calls to the opcode helpers): EIP-8141's canonical rules are stricter than the alt mempool's. Task 6 checks `canonicalMempoolValid` through `ethrex_simulateFrameTransaction` before sending, and states what to do if it is false.
2. **A predicted address that differs from the deployed one** (TS mirror of OpenZeppelin's clone code, or a different salt derivation): Task 3 compares `predictAccountAddress` with `factory.getAddress` on anvil for several owners and salts.
3. **`frames:new-account` on a chain where the factory is missing**: it must deploy the implementation and the factory first, then the account, and on a second run only bind. Task 5 tests both runs.
4. **A signature valid for one account accepted by another account of the same owner**: Task 3's ERC-7739 test signs for account A and checks account B returns `0xffffffff`.
5. **The quick devnet's genesis rewritten wrongly** (an existing alloc entry dropped or a balance overwritten): Task 1 tests that the extended genesis keeps every original alloc entry untouched.

---

### Task 1: `scripts/frame-devnet.ts`

**Files:**
- Create: `scripts/frame-devnet.ts`
- Create: `scripts/frame-devnet-config.ts` (pure: account derivation, genesis extension, Kurtosis config)
- Test: `scripts/test/frame-devnet-config.test.ts`
- Modify: `package.json` (scripts `devnet:frames` → `bun scripts/frame-devnet.ts`)

**Interfaces:**
- Produces (in `scripts/frame-devnet-config.ts`):
  - `devAccounts(): { address: Address; privateKey: Hex }[]` (ten, index order).
  - `extendGenesis(genesis: GenesisJson, funded: Address[], balance: Hex): GenesisJson` (adds alloc entries, keeps every existing one, throws if one of `funded` is already in `alloc` with a different balance).
  - `kurtosisConfig(funded: Address[]): object` (the mining devnet's args, as JSON).
  - `DEVNET_STATE_FILE` = `node_modules/.cache/frame-devnet.json`, holding `{ mode: "quick" | "mining"; rpcUrl: string; chainId: number }`.
- Produces (CLI): `bun scripts/frame-devnet.ts up quick|mining`, `down`, `status`, `rpc-url`. `rpc-url` prints only the URL (for scripts and tests).

- [ ] **Step 1: Write the failing tests** in `scripts/test/frame-devnet-config.test.ts`:
  - `devAccounts()[0].address` equals `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` and `[1]` equals `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (anvil's #0 and #1; these two are the cross-check, the rest is derived).
  - `extendGenesis` on a small fixture `{ config: { chainId: 9 }, alloc: { "0xabc…": { balance: "0x1" } } }` keeps `alloc["0xabc…"]` deep-equal, adds ten entries with `balance` `0xd3c21bcecceda1000000`, leaves `config` deep-equal.
  - `extendGenesis` throws `/already funded with a different balance/` when an anvil address is in `alloc` with another balance.
  - Address keys are compared ignoring case and a `0x` prefix, and new keys are written in the format the fixture's existing keys use (one fixture with `0x`-prefixed keys, one without). Before writing the fixture, read the real file's key format: `docker run --rm --entrypoint cat ghcr.io/forshtat/eip8141-devnet@sha256:c9a7… /fixtures/genesis/l1-hegota.json | head -c 600`.
  - `kurtosisConfig(addresses)`: `network_params.heze_fork_epoch === 2`, `participants[0].el_image === "ethrex:local"`, `participants[0].cl_image === "ethpandaops/lighthouse:focil"`, and `JSON.parse(network_params.prefunded_accounts)` has the ten addresses each with `{ balance: "1000000ETH" }`.
- [ ] **Step 2: Run** `bun test scripts/test/frame-devnet-config.test.ts`; expected FAIL (module not found).
- [ ] **Step 3: Implement `scripts/frame-devnet-config.ts`** with the values in Global Constraints.
- [ ] **Step 4: Run** the test again; expected PASS.
- [ ] **Step 5: Implement `scripts/frame-devnet.ts`.**
  - `up quick`: read the genesis out of the pinned image (`docker run --rm --entrypoint cat <image> /fixtures/genesis/l1-hegota.json`), `extendGenesis`, write it to `node_modules/.cache/frame-devnet/l1-hegota.json`, start container `evmcrispr-frame-devnet` with that file mounted read-only at `/genesis.json`, wait up to 60 s for `eth_chainId`, write the state file.
  - `up mining`: `docker pull` + `docker tag` the EL image, `kurtosis engine start`, write `kurtosisConfig` to `node_modules/.cache/frame-devnet/kurtosis.json`, `kurtosis run --enclave evmcrispr-frames <package ref> --args-file <file>`, resolve the RPC with `kurtosis port print`, write the state file, then wait until the latest block's timestamp is past genesis + 384 s + 12 s (print progress every minute; fail after 15 minutes or 90 s without a new block).
  - `down`: `docker rm -f evmcrispr-frame-devnet` and `kurtosis enclave rm evmcrispr-frames --force`, delete the state file.
  - `status`: chain id, latest block, anvil #0's balance.
  - Refuse to start on a non-amd64 host with a message naming the images.
- [ ] **Step 6: Verify by hand** (stop any probe containers first: `docker rm -f evmcrispr-ethrex-probe; kurtosis enclave rm evmcrispr-frames --force`):
  - `bun run devnet:frames up quick` then `bun run devnet:frames status` → chain id `9`, block `0`, anvil #0 balance `1000000 ETH`.
  - `bun run devnet:frames up mining` (≈ 7 min) then `status` → chain id `3151908`, block > 64, anvil #0 balance `1000000 ETH`.
  - `bun run devnet:frames down` → both gone (`docker ps`, `kurtosis enclave ls`).
- [ ] **Step 7: Commit** `git add scripts/frame-devnet.ts scripts/frame-devnet-config.ts scripts/test/frame-devnet-config.test.ts package.json && git commit --no-verify -m "scripts: frame devnets, quick and mining, with anvil accounts funded"`

### Task 2: A contract build that resolves OpenZeppelin

**Files:**
- Create: `modules/frames/scripts/compile.ts`
- Modify: `modules/frames/scripts/build-contracts.ts`, `modules/frames/test/unit/contracts.test.ts`, `modules/frames/package.json` (devDependency `"@openzeppelin/contracts": "5.6.1"`, exact)

**Interfaces:**
- Produces: `compileFrameContract(name: string, source: string): { abi: Abi; bytecode: Hex }` — solc-js 0.8.28 (`solc` devDependency), `evmVersion: "cancun"`, optimizer on, 200 runs, no viaIR (the settings `compileSolidity` uses today, so v1 bytecode is unchanged); imports starting `@forshtat/hegota-support/` resolve to that package's files, `@openzeppelin/contracts/` to that package's; anything else is an error naming the import.

- [ ] **Step 1: Switch `contracts.test.ts`'s "the committed bytecode matches a fresh compile"** to `compileFrameContract`; run `bun test test/unit/contracts.test.ts` in `modules/frames` → FAIL (module not found).
- [ ] **Step 2: Implement `compileFrameContract`**; point `build-contracts.ts` at it; `bun install`.
- [ ] **Step 3: Run** the test → PASS with the committed v1 artifacts unchanged (same settings, same compiler).
- [ ] **Step 4: Add a test** that compiling a source importing `@openzeppelin/contracts/proxy/Clones.sol` succeeds and one importing `forge-std/Test.sol` throws `/cannot import "forge-std\/Test.sol"/`. Run → PASS.
- [ ] **Step 5: Commit** `git commit --no-verify -m "frames: compile contracts with OpenZeppelin imports"` (the files above and `bun.lock`).

### Task 3: FrameAccount and its factory

**Files:**
- Modify: `modules/frames/contracts/FrameAccount.sol` (rewritten as the implementation)
- Create: `modules/frames/contracts/FrameAccountFactory.sol`
- Modify: `modules/frames/scripts/build-contracts.ts` (add the factory), `modules/frames/src/contracts/artifacts.ts` (regenerated: `frameAccountAbi`, `frameAccountBytecode`, `frameAccountFactoryAbi`, `frameAccountFactoryBytecode`)
- Create: `modules/frames/src/addresses.ts`
- Test: `modules/frames/test/unit/contracts.test.ts`, `modules/frames/test/integration/account.test.ts` (anvil; the integration runner picks the directory up)

**Interfaces:**
- Contract `FrameAccount is HegotaSupport(Devnet.ERC8421_WORKSHOP), ERC7739, IERC7579Execution-like surface`, constructed with no arguments (`EIP712("EVMcrispr Frame Account", "1")`), used only through clones:
  - `owner() view returns (address)`: `abi.decode(Clones.fetchCloneArgs(address(this)), (address))`.
  - `verify(uint8 scope)`: unchanged semantics (reads `TXPARAM(SIG_HASH)`, `SIGDATACOPY(0, 65, 0)`, checks the owner's signature over `_hashTypedDataV4(keccak256(abi.encode(keccak256("FrameTransaction(bytes32 sigHash)"), sigHash)))` with OpenZeppelin `ECDSA.recover` (low `s`, `v` 27/28), then `approve(Scope(scope))`).
  - `execute(bytes32 mode, bytes executionCalldata)`: `msg.sender == address(this)` only; call types single and batch, exec type default; anything else reverts `UnsupportedExecutionMode(mode)`. Via OpenZeppelin `ERC7579Utils`.
  - `executeFromExecutor(bytes32 mode, bytes executionCalldata) returns (bytes[])`: installed executors only.
  - `installModule(uint256 typeId, address module, bytes initData)` / `uninstallModule(...)`: `msg.sender == address(this)`, type 2 (executor) only, else `UnsupportedModuleType(typeId)`; calls `onInstall` / `onUninstall`.
  - `isModuleInstalled(uint256, address, bytes) view`, `supportsModule(uint256) view` (true for 2), `supportsExecutionMode(bytes32) view` (single and batch, default exec type), `accountId() pure` = `"evmcrispr.frame-account.2.0.0"`.
  - `isValidSignature(bytes32, bytes)`: ERC-7739, `_rawSignatureValidation` = ECDSA recover equals `owner()`.
  - `onERC721Received`, `onERC1155Received`, `onERC1155BatchReceived` (OpenZeppelin holders), `receive()`.
- Contract `FrameAccountFactory`, constructed with `address implementation`:
  - `createAccount(address owner, uint256 salt) returns (address)`: `Clones.cloneDeterministicWithImmutableArgs(implementation, abi.encode(owner), bytes32(salt))`, returning the existing address when it already has code; emits `AccountCreated(address indexed owner, uint256 salt, address account)`.
  - `getAddress(address owner, uint256 salt) view returns (address)`: `Clones.predictDeterministicAddressWithImmutableArgs`.
- `modules/frames/src/addresses.ts` produces:
  - `DETERMINISTIC_DEPLOYER: Address`, `IMPLEMENTATION_ADDRESS: Address`, `FACTORY_ADDRESS: Address` — computed with viem `getContractAddress({ opcode: "CREATE2", from: DETERMINISTIC_DEPLOYER, salt: zero, bytecode })` from the artifacts (never written by hand).
  - `deploymentTransactions(): { to: Address; data: Hex }[]` — implementation, then factory, each `salt ‖ initCode` to the deployer.
  - `predictAccountAddress(owner: Address, salt: bigint): Address` — the clone's CREATE2 address computed in TS (OpenZeppelin's clone-with-immutable-args init code: `0x61` ‖ uint16(0x2d + args.length) ‖ `3d81600a3d39f3363d3d373d3d3d363d73` ‖ implementation ‖ `5af43d82803e903d91602b57fd5bf3` ‖ args).

- [ ] **Step 1: Write the integration tests** (`test/integration/account.test.ts`, anvil gnosis fork, deploy through `deploymentTransactions()` from `TEST_ACCOUNT`):
  - `predictAccountAddress(owner, salt)` equals `factory.getAddress(owner, salt)` for owners anvil #0 and #1 and salts `0n`, `1n`, `2n**255n`.
  - `createAccount` twice returns the same address and deploys once (one `AccountCreated` log); `owner()` of the clone equals the owner; `accountId()` equals `evmcrispr.frame-account.2.0.0`.
  - `execute` with a batch of two transfers, called by the account itself (`anvil_impersonateAccount` the clone), moves both; called by anyone else reverts; a delegatecall mode reverts `UnsupportedExecutionMode`.
  - `installModule(2, executor, "0x")` from the account, then `isModuleInstalled(2, executor, "0x")` true and `executeFromExecutor` from `executor` works; `installModule(1, …)` reverts `UnsupportedModuleType(1)`.
  - ERC-7739: owner #0 signs a message for account A (`viem/experimental/erc7739` `signMessage` with `verifier` A); A's `isValidSignature` returns `0x1626ba7e`, account B (same owner, salt 1) returns `0xffffffff`; a high-`s` variant of the inner signature returns `0xffffffff`.
- [ ] **Step 2: Run** `bun scripts/run-integration-tests.ts frames` → FAIL (contracts missing).
- [ ] **Step 3: Write the contracts** per the Interfaces; add the factory to `build-contracts.ts`; `bun run build:contracts`; write `addresses.ts`.
- [ ] **Step 4: Update `test/unit/contracts.test.ts`**: compile-matches-committed for both contracts; `frameAccountAbi` contains `verify(uint8)` (`0xb2225351`), `execute(bytes32,bytes)`, `isValidSignature(bytes32,bytes)`, `accountId()`; replace the v1 source-regex test of low `s` / `v` with the integration test above (OpenZeppelin `ECDSA` enforces both).
- [ ] **Step 5: Run** unit and integration tests → PASS. Note in the commit body nothing; record the implementation's and a clone's runtime sizes in the PR notes for Task 6.
- [ ] **Step 6: Commit** `git commit --no-verify -m "frames: frame account, a factory of clones with ERC-7579 and ERC-7739"`

### Task 4: viem-frames on any frame chain, canonical mempool without a sidecar

**Files:**
- Modify: `packages/viem-frames/src/send.ts`, `packages/viem-frames/test/unit/send.test.ts`
- Modify: `modules/frames/src/account.ts`, `modules/frames/test/unit/account.test.ts`

**Interfaces:**
- `sendFrameTransactionWithArbitrarySignature` gains `chain?: Chain` (default `altMempoolDevnet`; its id goes into the transaction, its explorer, when it has one, into the not-mined error) and reads fees from the sidecar (`skandha_getGasPrice`) when `mempool === "alt"`, from the node (viem `estimateFeesPerGas`) when `"canonical"`; the sidecar status call is skipped for `"canonical"`.
- `frameAccountTypedData(account: Address, sigHash: Hex, chainId: number)` (chain id now required); `sendAccountFrameTransaction` gains `chain?: Chain` and passes it on.

- [ ] **Step 1: Tests (viem-frames):** with a gateway mock answering `eth_chainId` `0x301824`, `eth_feeHistory`/`eth_maxPriorityFeePerGas` and no `skandha_*`, `send(g, { chain: kurtosisChain, mempool: "canonical" })` sends `eth_sendRawTransaction` whose decoded `chainId` is `3151908n`, and `g.methods()` contains no `skandha_` method. With `mempool: "alt"` the existing tests pass unchanged.
- [ ] **Step 2: Tests (frames):** `frameAccountTypedData(A, h, 3151908).domain.chainId === 3151908`; `sendAccountFrameTransaction({ …, chain })` asks typed data with that chain id.
- [ ] **Step 3: Run** both → FAIL. **Step 4: Implement.** **Step 5: Run** both → PASS; `bun run type-check` in both packages and the terminal (rebuild `modules/frames` types with `bun run types` first).
- [ ] **Step 6: Commit** `git commit --no-verify -m "viem-frames: any frame chain, canonical fees from the node"`

### Task 5: `frames:new-account` through the factory, and `@frames:account`

**Files:**
- Modify: `modules/frames/src/commands/new-account.ts`, `modules/frames/src/commands/new-account.md`, `modules/frames/src/deploy.ts`
- Create: `modules/frames/src/helpers/account.ts`, `modules/frames/src/helpers/account.md`
- Modify: `modules/frames/test/unit/new-commands.test.ts`, `apps/evmcrispr-website/src/content/docs/guides/frame-transactions.md` ("From a smart account")
- Regenerate: `modules/frames/src/_generated.ts` (`bun run codegen` in the module)

**Interfaces:**
- Consumes: `FACTORY_ADDRESS`, `deploymentTransactions()`, `predictAccountAddress()` (Task 3).
- `deploy.ts`: `FRAME_CHAIN_IDS: readonly number[] = [1337, 9, 3151908]` (the alt-mempool devnet, the quick devnet, the mining devnet; a comment says 3151908 is also the public Hegota devnet, whose client these contracts do not target) replaces `FRAME_CHAIN_ID`; `deployInline`'s refusal names the chain with `chainLabel` and lists the three.
- `frames:new-account <variable> [--owner <address>] [--salt <number>]`: when `FACTORY_ADDRESS` has no code, sends `deploymentTransactions()` first (one transaction each, through the host's wallet, waiting for each receipt); when the predicted account has no code, sends `createAccount(owner, salt)` to the factory; binds `predictAccountAddress(owner, salt)` after checking it has code. `--salt` is a non-negative integer below 2^256 (`gasOption`-style error: `--salt must be a non-negative integer below 2^256`).
- `@frames:account(owner [salt])` → the predicted address, no transaction (`optional: true` on `salt`, default 0).

- [ ] **Step 1: Tests** (`new-commands.test.ts`, with an `actionCallback` that records actions and answers receipts, and a mocked `getCode`):
  - factory missing, account missing → three actions: to the deployer (implementation), to the deployer (factory), to the factory (`createAccount(owner, 0)`); the variable equals `predictAccountAddress(owner, 0n)`.
  - factory present, account missing → one action; account present → no action, still bound.
  - `--salt 7` → `createAccount(owner, 7)`; `--salt -1` → the salt error.
  - on chain 100 → the refusal naming Gnosis and the three chains.
  - `@frames:account(@me)` equals `predictAccountAddress(TEST_ACCOUNT_ADDRESS, 0n)` and `@frames:account(@me 3)` with salt 3; no action is sent.
- [ ] **Step 2: Run** `bun run test:unit` in `modules/frames` → FAIL. **Step 3: Implement**, `bun run codegen`. **Step 4: Run** → PASS; `bun run scripts/validate-docs.ts` from the repo root → 0 errors.
- [ ] **Step 5: Docs:** `new-account.md` (factory, salt, idempotence, predicted address), `account.md` (the helper, an example funding an account before creating it), the guide's "From a smart account" section (the same, and: accounts made before the factory are devnet leftovers, create a new one).
- [ ] **Step 6: Commit** `git commit --no-verify -m "frames: new-account through the factory, @frames:account"`

### Task 6: Live end to end on the mining devnet

**Files:**
- Create: `modules/frames/test/devnet/account.devnet.test.ts`
- Modify: `modules/frames/package.json` (script `test:devnet`: `EVMCRISPR_FRAME_DEVNET=1 bun test ./test/devnet`)

**Interfaces:**
- Consumes: `bun scripts/frame-devnet.ts rpc-url` (Task 1), `deploymentTransactions`, `predictAccountAddress`, `FACTORY_ADDRESS` (Task 3), `sendAccountFrameTransaction({ chain, mempool: "canonical" })` (Task 4), `layoutFrames` and `requireLimits` (existing, `modules/frames/src/layout.ts`).
- The test is skipped unless `EVMCRISPR_FRAME_DEVNET=1`; it reads the RPC from the state file and refuses to run if the chain id is not 3151908.

- [ ] **Step 1: Write the test.** With anvil #0 as owner and sender of ordinary transactions (viem wallet client, `defineChain({ id: 3151908, … })`):
  1. deploy implementation and factory when missing; `createAccount(owner, 0)`; fund the account with 1 ETH;
  2. lay out `frames:tx --account` frames for one SENDER frame sending 1 wei to `0x000000000000000000000000000000000000dEaD` (`gas: 50_000n`, `stateGas: 200_000n`) with `layoutFrames({ accountChecks: true, … })`;
  3. **checkpoint:** sign the unsigned transaction's typed data and run `ethrex_simulateFrameTransaction` (viem-frames `simulate`) → expect `executionStatus: "success"`, `canonicalMempoolValid: true`, and the account's verify frame's `gasUsed` below `ACCOUNT_CHECK_GAS` (40,000, `modules/frames/src/layout.ts`; v1 used about 15,000). If it is not below, raise `ACCOUNT_CHECK_GAS` to the measured value ×1.25 rounded up to a thousand, with a comment giving the measurement and date;
  4. `sendAccountFrameTransaction({ mempool: "canonical", chain, … })` → receipt `status: "success"`, `payer` = the account, every `frameReceipts[i].status === "success"`, `0xdEaD`'s balance up by 1 wei.
- [ ] **Step 2: Run** `bun run devnet:frames up mining`, then `bun run test:devnet` in `modules/frames` → PASS.
  - **If the checkpoint shows `canonicalMempoolValid: false`**, record `canonicalMempoolViolation` and stop: report it to the owner with the two fallbacks (a whole contract per account through the factory, no clone; or validation without the delegatecall chain) rather than choosing one.
- [ ] **Step 3: Final verification** (the commits skipped the hook): from the repo root `bun run type-check`, `biome check .`, `bun test:unit`, `bun scripts/run-integration-tests.ts frames sim`, `bun run scripts/validate-docs.ts`, `bun run test:devnet` in `modules/frames`. All pass.
- [ ] **Step 4: Commit** `git commit --no-verify -m "frames: live frame account test on the mining devnet"`. Do not push; regroup with the existing history only when the owner asks to push.
