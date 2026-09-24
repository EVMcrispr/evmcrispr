# Changelog

## Unreleased

### Smart block syntax

Smart payloads use `!(...)` with `batch`, `safe:propose`, `safe:propose-offline`, and `safe:execute`. Ordinary `(...)` blocks keep their existing semantics, including inherited smart execution for nested control flow.

`safe:propose-offline $tx <safe> !(...)` compiles smart payloads into Safe transaction JSON for review with `@safe:verify`. Salt and nonce remain optional; use matching `--salt`, `--nonce`, and other compilation inputs to reconstruct a transaction, or keep its JSON.

### Safe: commands named after where the result goes

The experimental `safe` module has one command per step and destination. The command name says where the result goes: the Safe Transaction Service (`propose`, `confirm`), a variable holding JSON (`propose-offline`, `confirm-offline`), or the chain (`confirm-onchain`, `execute`). The argument says what it acts on:
- a command block, or `cancel` for a rejection;
- a quoted message;
- a nonce, or a 32-byte hash (`--message` for a safeMessageHash);
- Safe transaction or Safe message JSON.

Exported JSON is now called a Safe transaction or Safe message (formerly "package"); its format is unchanged, so JSON exported earlier still imports.

- `safe:confirm <safe> <hash>` confirms a transaction or message queued on the service. `safe:confirm-offline $var <safe> <json | hash>` adds your signature to JSON, or exports a queued item with its confirmations. `safe:confirm-onchain` (formerly `approve-hash`) confirms with `approveHash`.
- `safe:propose` also posts signed JSON (its first owner signature proposes, the rest become confirmations, no wallet prompt) and queues Safe messages. It refuses consumed nonces.
- `safe:propose $safe cancel --nonce 42` and `safe:propose-offline $r $safe cancel --nonce 42` create the rejection the Safe web app uses: a zero-value call to the Safe itself.
- Safe messages (EIP-191 text or EIP-712 typed data) work on the service and as JSON. `@safe:signature` returns the packed owner signatures, e.g. the EIP-1271 signature a dapp asks for.
- `@safe:verify(<safe> <nonce | hash | json> message: abi: no-rpc:)` returns the review as JSON: integrity-checked hashes, decoded calls, warnings, signature checks, readiness, and competing transactions at the same nonce. A nonce with several queued transactions is an error listing them.
- Owner Safes are seamless: `confirm`, `confirm-offline`, `confirm-onchain` and `propose` find how your wallet owns the Safe — directly or through owner Safes up to three levels deep (`--via` picks among several). An owner Safe you complete alone signs off-chain (EIP-1271, no gas) or sends `approveHash` in one transaction; one that needs more signatures gets its `approveHash` proposed in its own queue, as in Safe{Wallet}. Offline, each of its owners adds a signature under it in the JSON until its threshold is met, and `@safe:verify` shows the progress.
- Contract signatures follow the parent Safe's version: Safe >=1.5.0 checks owner Safes with the hash through `isValidSignature(bytes32,bytes)`, older Safes with the preimage through the legacy `isValidSignature(bytes,bytes)`. Previously every Safe used the legacy form, so owner-Safe signatures for Safe 1.5.0 were rejected.
- `safe:execute <hash>` packs the service's confirmations like JSON signatures, so contract signatures from owner Safes execute correctly.
- `safe:confirm-onchain` also confirms Safe messages (`approveHash` of the safeMessageHash).

**Breaking changes (experimental `safe` module):**

| Before | After |
|---|---|
| `safe:propose $safe (...) --no-api true --unsigned true --as $tx` | `safe:propose-offline $tx $safe (...)` |
| `safe:propose $safe $tx --no-api true` | `safe:confirm-offline $tx $safe $tx` |
| `safe:execute $safe $tx --no-api true` | `safe:execute $safe $tx` |
| `safe:execute $safe (...) --no-api true --nonce 7 --signatures [...]` | `safe:propose-offline` the block, `@safe:merge` the signatures, then `safe:execute $safe $tx` |
| `safe:verify $safe <nonce \| hash \| $tx>` (`--as`, `--abi`, `--offline`) | `print @safe:verify($safe <nonce \| hash \| $tx>)` (`abi:`, `no-rpc:`) |
| `safe:verify $safe (...)` | `safe:propose-offline` the block, then `@safe:verify` |
| `safe:verify ... --nested-safe $owner` | `safe:propose $owner (safe:confirm-onchain $safe <hash>)` prints the owner Safe's hashes |
| `safe:verify-message $safe "text"`, `@safe:messageHash` | `safe:propose-offline $msg $safe "text"`, then `@safe:verify($safe $msg)` |
| `safe:verify-message ... --format bytes` (nested owners) | `safe:confirm-offline $tx $safe $tx` from an owner of the owner Safe |
| `safe:approve-hash $safe <hash \| $tx>` | `safe:confirm-onchain $safe <hash \| $tx>` |
| `safe:approve-hash $safe (...)` | `safe:propose-offline` the block, then `safe:confirm-onchain` |
| report field `package` | `safeTransaction` / `safeMessage` |
| `@safe:merge(package ...)` argument name | `@safe:merge(base ...)` |
| `SafePackage`, `parseSafePackage`, `transactionPackage`, … in `@evmcrispr/module-safe/transactions` | `SafeSignable`, `parseSafeSignable`, `transactionSignable`, … |

### Safe delegates

- New `safe:delegate add <safe> <account>` lets another account propose transactions of a Safe on the Safe Transaction Service for the connected owner, without confirming them (`--label`, `--expires`); `@safe:delegates(<safe>)` lists them. `safe:delegate remove <safe> <account>` removes it, run by the owner who added it or by the delegate itself.

### Safe v1.5.0

- The safe module uses Safe v1.5.0: `safe:new` deploys with the v1.5.0 proxy factory, CompatibilityFallbackHandler and MultiSend contracts, and `@safe:address` predicts with the v1.5.0 proxy creation code, so predicted addresses differ from before. TWAP execution Safes of the swaps module use v1.5.0 too.
- `safe:new` creates Safes the way Safe{Wallet} does: the plain singleton plus a `SafeToL2Setup` delegatecall in `setup()` that switches the Safe to the L2 singleton on every chain but Ethereum mainnet. The same owners, threshold and salt now give the same address on every chain, including mainnet, which is what the Safe web app's "Add network" requires.
- The zero-salt CREATE2 deployment used on chains without Safe's canonical factory (the EEZ devnet) now holds the v1.5.0 contracts, plus the plain singleton, SafeToL2Setup and SafeMigration, at new addresses; redeploy it with `DEPLOYER_KEY=… bun modules/safe/scripts/deploy-create2.ts <rpc…>` (`--print` lists them).
- New `safe:upgrade` moves a Safe v1.3.0 or later to v1.5.0 through Safe's `SafeMigration` contract, like the Safe web app's "Update Safe": one delegatecall that keeps the Safe's L2 or plain flavour and any custom fallback handler. `@safe:verify` recognizes the migration instead of warning about the delegatecall.
- Module guards (Safe v1.5.0): `safe:set-guard --module` and `safe:remove-guard --module` set and clear the guard that checks every module transaction, and `@safe:guard(safe module:true)` (and its `!` face) reads it. `--module` refuses a Safe below v1.5.0 unless a `safe:upgrade` earlier in the same block upgrades it. Both guard commands now check that the address reports the right guard interface before emitting the call, instead of leaving a bare `GS300`/`GS301` revert.

### Deterministic Safe addresses

- `@safe:address(owner salt)` predicts the single-owner Safe deployed by `safe:new owner --salt salt`, with salt defaulting to 0. Both use the selected chain's Safe deployment profile and predict without RPC access.
- The helper identifies the initial deployment configuration; it does not check deployment or current ownership. Safe ownership and threshold remain configurable.

### `@sender`: who the calls come from

- New std helper `@sender`: the account the current calls are sent from. It is `@me` (the connected wallet) at the top level and, inside a block that executes as another account, that account: the Safe in `safe:propose`/`safe:execute`, the last forwarder in aragonos `forward`, the DAO in aragonosx `propose`, the governor's timelock (or the governor) in `governor:propose`/`queue`/`execute`/`cancel` and the timelock in `governor:timelock-schedule`/`timelock-execute`. `batch` stamps it as the batch sender. `@me` never changes meaning.

### Named arguments and records

- Helper calls accept named arguments: `@helper(val opt:3)` fills the `opt` argument by name, after any positional args and in any order. Optional args become skippable (`@http:fetch($url auth:$token)`), and helpers can declare named-only options (shown as `name:<value>` in their docs).
- Record literals: `[a:1 b:2]` is sugar for the entries array `[["a" 1] ["b" 2]]`, with a new `record` arg type validating the shape. `zk:prove --inputs [a:3 b:11]` uses it; the entries-array and JSON-string forms keep working.
- New `@lang` helpers over records: `@keys`, `@values`, `@lookup`.
- The editor understands the syntax end to end: highlighting, `name:` completions for optional args, signature help, hover cards, and diagnostics for unknown/duplicate/misplaced names.
- A `name:value` bareword inside helper parens or array literals now means a named argument, not a literal string — quote it (`'name:value'`) for the literal; URLs (`ipfs://…`, `https://…`) are unaffected. The experimental compile helpers use this natively: `@contracts:solidity($src runs:1000 via-ir:true optimizer:false)` replaces the quoted option strings, and the zk setup/tree helpers take `ptau:` / `system:` / `lean:` / `depth:` / `pad:` the same way.

### Declared errors: refusals a module documents

- A module declares the ways a command or helper can refuse to run, next to its arguments and options: an `errors:` block names each refusal, describes it and gives it typed fields, and the run context's `fail(name, fields, message)` raises one with the human message written at the raise site. Declared errors are ABI-encoded like a contract's custom errors, so scripts accept them by name and destructure their fields exactly like a revert — with the new refusal arrows, never by matching message text.
- New capture arrows for build-time failures: `-/>` (required) and `-?/>` (optional). A script accepts a refusal by name: `swaps:twap … -?/> BelowMinimum [$minimum]`. A name after a refusal arrow resolves in the declarations of the command and of the helpers on its line, and nowhere else. Spell `Name(uint256)` to pick one signature exactly. Reference pages gained an **Errors** section listing them, and the editor offers them (with their destructure templates) after `-/>` / `-?/>`, hovers them, and flags an ambiguous name or an oversized destructure before you run.
- Helpers declare errors the same way. A helper's refusal is a build-time failure of the command line that evaluated it, and a refusal capture on that line catches it. The command body does not run, its result variable is not assigned (an existing binding keeps its value), and the capture writes only its own named variables — it does not hand the helper a replacement value or resume it. `set $x @h -/> Failure [_ $x]` binds a field to `$x` as an ordinary destructure.
- `-/>` / `-?/>` catch any capturable failure raised before a transaction is sent — a declared error, a helper refusal, a failed preflight, an amount below a protocol minimum, a missing argument, a read that reverts in an inline `::{…}` call on the line. They work on commands that send nothing, such as `set`, and inside a collecting block (`batch`, `safe:execute`, proposals), where the refusal happens as the line is composed and the actions prepared by the other lines are let through. Inside a smart batch (`batch !(...)`) a matched refusal rolls the plan back to that line's checkpoint.
- Capturing a failure is not a rollback: variables bound earlier, off-chain effects and the transactions a multi-action command already sent all stay.
- Declarations list a module's supported refusals, not every possible exception. A declaring command can still fail in undeclared ways, and an undeclared helper failure — a missing variable, a typo, a read that reverts inside the helper — stays a script error that neither `-?/> $e` nor `-?!> $e` swallows.

**Breaking changes to existing captures:**

- `-!>` / `-?!>` capture **only** a revert of the transaction the line sent. A line carrying just revert captures that fails before sending propagates that failure untouched, and its revert flags stay unset; build-time refusals are captured with `-/>` / `-?/>` instead. A bare name that the line declares is rejected after a revert arrow (`"SameToken" is a refusal declared by this line; capture it with -/> or -?/>`); when a contract really does revert with an error of that name, spell the signature inline.
- Revert captures are refused inside a collecting block (`batch`, `safe:execute`, proposals) — no inner line can observe the outer transaction's revert, so capture it on the block command. Inside a smart batch (`batch !(...)`) they are refused with a pointer to the on-chain form: `assert @reverts!(<target>::!{<signature>} -!> Name())` for `-!>`, and `if @reverts!(<target>::!{<signature>} -!> Name()) ( … )` for `-?!>`. Refusal captures are allowed in both.
- Requiring both timings on one line (`-/>` together with `-!>`) is rejected before the script runs: a line cannot refuse before sending and revert after. Requiring one while permitting the other is fine, and a mixed list evaluates each family at its own time.
- Several error captures on one line are an alternation, not a conjunction: the line is accepted when **at least one** clause matches, each flagged clause reads `"true"` / `"false"` for its own match, and only the matching clause's destructure is applied. A list of required clauses is a required alternation rather than several requirements, and a mixed list requires the failure while accepting any matching clause.
- When no clause matches, the original failure propagates unchanged instead of becoming `expected error "X" but got "Y"`: a revert stays a revert and a refusal stays itself, with the failing line's location. An optional named capture no longer turns a mismatched failure into a `"false"` flag and carries on — only success does that.
- Error captures of either family on block commands (`if`, `loop`, `def`) are refused before the block runs, instead of after it had already executed its transactions.
- Revert captures observe only the actions a command returns. A few commands send a transaction from inside their body (`giveth:donate`, `token:permit`, `safe:propose`, `std:sign`), so a revert there surfaces while the line is still running and is a refusal of the line: catch it with `-?/> $e` or an inline signature, not with a revert capture.

### Token

- New experimental helper `@token:holdings(address chain?)`: the ERC-20 tokens an account holds with a nonzero balance, as indexed by the chain's Blockscout instance (keyless), returned as addresses in the explorer's order. Read live amounts with `@balance` before spending them. Together with the TWAP rounding and the refusal captures below, "swap everything an account holds to USDC" is a four-line loop.
- `@token:holdings` declares `NoExplorer(chainId)`, raised only when the chain has no Blockscout instance to ask. The command line that evaluates the helper captures it with a refusal arrow: `set $tokens @token:holdings($safe) -?/> NoExplorer` permits it (the `set` does not happen, so an existing `$tokens` keeps its value), and `-/> NoExplorer [$chain]` requires it and binds the chain id.
- An explorer that cannot be reached, answers with a non-OK status or returns something other than a token list is an outage, not a missing explorer: it stops the script, and no `NoExplorer` capture silences it. An account holding no ERC-20 still returns an empty list.

### Swaps

- `swaps:twap` rounds the sell amount down to a multiple of `--parts` instead of rejecting amounts that do not divide evenly, so a full balance is a valid amount. The leftover base units never leave the funder and are reported in the log. Amounts below `--parts` base units are still rejected.
- `swaps:twap` accepts `max` as the amount: the funder's whole balance of the sell token, read when the script builds. This is what lets a loop over `@token:holdings` run inside `safe:execute`, where a `@balance` read after the first collected order is not allowed.
- `swaps:twap` declares the orders it refuses to create, so a loop can skip them by name: `SameToken` (the buy token itself), `NoBalance` (the funder holds none of it), `Unfunded(parts)` (less than `--parts` base units), `BelowMinimum(minimum)` (a part below the network's minimum order value, in USDC base units) and `NoQuote` (CoW declines to quote the token or order). `-?/> SameToken -?/> BelowMinimum -?/> NoBalance -?/> Unfunded` on the command line skips exactly those, where a blanket `-?/> $skipped` swallows everything.
- `NoQuote` covers only the rejection codes CoW documents for declining a quote: `NoLiquidity`, `InsufficientLiquidity`, `UnsupportedToken` and `SellAmountDoesNotCoverFee`. An unknown code, a server error, a timeout, a malformed response, an unavailable valuation, a temporarily suspended token and a quote that does not verify or does not match the request stop the script as before, even under a `NoQuote` capture. CoW API failures now report the rejection code alongside the HTTP status.
- **Breaking:** `swaps:twap` binds the order hash instead of a JSON reference, and `@swaps:twapStatus`, `@swaps:twapParts`, `swaps:twap-cancel` and `swaps:twap-recover` take only that hash. The rest is read back and verified on-chain: from CoW's programmatic-order indexer first, then from roughly the last six hours of blocks for orders it has not indexed yet (or while it is down). Saved JSON references no longer work; pass their `orderHash` field instead.

### Status boxes

- Transactions, Safe proposals and CoW TWAP orders show as status boxes
  that update while they happen: *Waiting for wallet → Sent → Confirmed*,
  *Proposed → 1/2 confirmations → Executed*, *Started → 1/4 executed → …
  → Finished*. A box nests under the transaction or proposal that carries
  it, and ends with the carrier's reason when that fails (rejected in the
  wallet, reverted, replaced).
- A run stays open while a Safe proposal or a TWAP it created is still in
  progress, in the terminal and the CLI; Cancel (or Ctrl-C) stops
  following, and the boxes say "Stopped following" (the proposal or order
  itself is untouched). The CLI says when the script has finished and it is
  only following boxes. Simulations never wait: a box opened inside
  `sim:fork` ends when the fork does.
- A later line failing does not mark a posted proposal or a registered order
  as failed: those boxes end "Stopped following: the script failed". A
  transaction cancelled after it was sent says so ("Sent; stopped waiting for
  the receipt") instead of reading as never sent.
- The separate "Transaction confirmed" log line is replaced by the
  transaction's box. Every change to a box's detail is still logged as a line.
- Module authors open boxes with `interpreters.box` (ended with `done`,
  `fail` or `cancel`) and report wrapped outcomes with `interpreters.carry`.
  An action that was sent or queued without a known result (a Safe App
  batch, a host that returned no receipt) settles as `unknown`, not
  `not-sent`.

## 0.11.1

A patch release: fixes for problems found right after 0.11.0 shipped, plus a few small editor and CLI improvements. No breaking changes.

### Fixed

- WalletConnect sessions are broken in production builds: `cross-fetch` is no longer externalized.
- Plain-CREATE address prediction (`reserveNextAddress`/`predictNextAddress`), and `--nonce` is honored in the sim backends.
- `simulate` now reports `sim:fork` executions: the interpreter observes dispatched actions.
- On-chain revert reasons are decoded into simulation error messages.
- `@includes` and `@unique` compare by value, not by JS shape. A `::` call's return is normalized to a number only when it is a top-level scalar, so an array read from a contract arrived in a different shape than a literal: `@includes` answered `false` for an element that was present, and `@unique` keyed on a truncated string form, collapsing values that differ beyond 18 decimals.
- `@assertions:codehash` follows EXTCODEHASH semantics: `bytes32(0)` for a nonexistent account, instead of the hash of the empty string. It now agrees with `assert-codehash`, which reads the hash on-chain.
- Corrupted Optimism USDC address in the bridges registry.
- A proxy whose ABI cannot be fetched raises the lookup failure instead of resolving to an empty ABI. Both halves of a proxy lookup failing — the ABI service down, or rate-limited by its upstream explorer — used to read downstream as "this contract has no functions".
- Codegen meta extraction is anchored at the `define` call — std's `@token` was registering as "Ether", so analysis flagged every `@token` use as an unknown helper.
- Monaco assets are self-hosted instead of loaded from a CDN: injected `<script>` tags cannot be hash-verified, so the CDN is no longer trusted.
- Editor and viewer agree on word wrap and bracket-pair colors.
- shadcn enter/exit animations render again (`tw-animate-css`), and utilities renamed in Tailwind v4 (`bg-linear-to-*`, `wrap-break-word`, suffix `!`) are migrated.
- Chat failures are classified instead of surfaced raw: a rejected Nexus API key is dropped so the panel offers a fresh login, while out-of-credit, rate-limit and network errors keep the key and say what to do about them.
- `lint-staged` tasks now run on `modules/`, which the globs had never covered.

### Added

- Monaco upgraded from 0.52.2 to 0.56.0, four upstream releases at once — 0.11.0 stayed on 0.52.2 because 0.53 swallowed the first keystroke typed over a backward selection, and 0.56.0 is the first release with that fixed. What the jump brings to the editor:
  - Text input goes through the browser's EditContext API instead of a hidden textarea (0.53), which is what makes IME composition, dead keys and screen readers behave.
  - Middle-click scrolling, with `editor.mouseMiddleClickAction` to configure it (0.53, 0.54).
  - A hardened hover renderer: DOMPurify updated to 3.2.7 (0.55) and Markdown coming from language providers treated as untrusted (0.56) — this is the path our address and IPFS hover previews render through.
  - Tree-shakeable ESM entry points and a native `lsp` namespace (0.55, 0.56), which is what a future EVML language server would plug into.
- `--version` flag and `--help` on every CLI subcommand.
- Editor hovers describe command options and parameters.
- Side-panel inputs autofocus when their tab is revealed.

### Internal

- Lint and pre-commit checks for utilities renamed in Tailwind v4.
- Astro frontmatter is linted and formatted with Biome, and `astro check` runs on astro-only commits.
- Integration suites are capped at 8G via systemd-run scopes.

## 0.11.0 — "New Foundations"

We rebuilt EVMcrispr from the ground up: EVML is now a real scripting language, every module lives in its own package, simulations run in the browser with no API key, and the whole toolchain is AI-ready.

### EVML, the language

- New control flow: `if`, `loop` (with `break`/`continue`), `exit`, and `def` functions with typed arguments and `return`.
- Captures pipe command results into variables: event captures, error captures, and transaction captures (`$> $tx`, `$*> $txs`).
- Inline ABI calls `::{method(inputs)(outputs) args}` read any contract wherever an argument fits.
- Commas are gone — arguments, arrays and helper args are space-separated; newlines are allowed inside helpers, arrays and strings.
- Heredoc literals (`<<<SOL … SOL`) with embedded Solidity/JSON highlighting; number units (`wei`, `gwei`, `eth`), time and rate literals; `%` and `//` operators.
- New helper families: `@num`/`@str`/`@bool`/`@and`/`@or`/`@not`, string/array/bytes utilities, `@abi.encode`/`@abi.decodeCall`, `@concat`, `@hash`, `@sigValid`.
- Module helpers are namespaced (`@token:balance`), and `load` takes explicit import lists with renames.

### Modules

- New stable modules: **token** (transfer, disperse, EIP-2612 permit, balance helpers), **contracts** (deploy via CREATE/CREATE2/CREATE3, verify through Etherscan V2), **ens** (registration, renewal, records, resolution), **http**, **assertions** and **lang**.
- Reworked: **giveth** (DonationHandler donations, GIVpower staking and boosting) and a much simpler single-DAO **aragonos**.
- **sim** (formerly tenderly): simulations run entirely in the browser with no API key, on the EthereumJS or revm (Rust compiled to WASM) backends, plus Anvil fork support.

### Terminal & tooling

- Terminal UI revamped; the editor is its own package with autocompletion, address hovers, inline diagnostics, static semantic analysis and F2 rename.
- Scripts run in a Web Worker: the UI stays responsive and runs can be aborted.
- Encrypted script sharing (AES-GCM, key stays in the link fragment) and IPFS drag-and-drop uploads with hover previews.
- AI chat panel that can edit, validate and simulate your script, with Dappnode Nexus login.
- New MCP server and CLI; docs rebuilt from scratch, with every EVML example validated in CI.

### Breaking changes

- Packages renamed: `@1hive/evmcrispr` → `@evmcrispr/core`, plus one package per module.
- Renames: `raw` → `send`, `for` → `loop`, `@id` → `@hash`, tenderly module → `sim`.
- `token.*` helpers moved from std to the token module as `@token:*`.
- Comma-separated arguments are no longer valid.
- aragonos: single-DAO `connect`, label-free `install`, `dao` and `subgraph` naming.

### Experimental preview

0.11.0 also ships twelve experimental modules — acl, aragonosx, bridges, crypto, explorer, governor, lending, proxies, safe, superfluid, swaps and vault — plus EVML-authored modules (`def module`, `load --from ipfs://…`), in-editor Solidity compilation and ENS NameWrapper support. These are behind the experimental flag and may change before stabilizing: try them at [next.evmcrispr.com](https://next.evmcrispr.com), with `evmcrispr --experimental` in the CLI, or with `VITE_PUBLIC_EXPERIMENTAL=true` when embedding.
