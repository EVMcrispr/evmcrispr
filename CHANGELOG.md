# Changelog

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
- Codegen meta extraction is anchored at the `define` call — std's `@token` was registering as "Ether", so analysis flagged every `@token` use as an unknown helper.
- Monaco assets are self-hosted instead of loaded from a CDN, and Monaco is bumped to 0.56.0, which fixes the first keystroke being dropped after a backward selection.
- Editor and viewer agree on word wrap and bracket-pair colors.
- shadcn enter/exit animations render again (`tw-animate-css`), and utilities renamed in Tailwind v4 (`bg-linear-to-*`, `wrap-break-word`, suffix `!`) are migrated.
- `lint-staged` tasks now run on `modules/`, which the globs had never covered.

### Added

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
