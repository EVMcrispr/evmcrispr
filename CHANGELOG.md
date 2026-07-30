# Changelog

## Unreleased

### Named arguments and records

- Helper calls accept named arguments: `@helper(val opt:3)` fills the `opt` argument by name, after any positional args and in any order. Optional args become skippable (`@http:fetch($url auth:$token)`), and helpers can declare named-only options (shown as `name:<value>` in their docs).
- Record literals: `[a:1 b:2]` is sugar for the entries array `[["a" 1] ["b" 2]]`, with a new `record` arg type validating the shape. `zk:prove --inputs [a:3 b:11]` uses it; the entries-array and JSON-string forms keep working.
- New `@lang` helpers over records: `@keys`, `@values`, `@lookup`.
- The editor understands the syntax end to end: highlighting, `name:` completions for optional args, signature help, hover cards, and diagnostics for unknown/duplicate/misplaced names.
- A `name:value` bareword inside helper parens or array literals now means a named argument, not a literal string — quote it (`'name:value'`) for the literal; URLs (`ipfs://…`, `https://…`) are unaffected. The experimental compile helpers use this natively: `@contracts:solidity($src runs:1000 via-ir:true optimizer:false)` replaces the quoted option strings, and the zk setup/tree helpers take `ptau:` / `system:` / `lean:` / `depth:` / `pad:` the same way.

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
