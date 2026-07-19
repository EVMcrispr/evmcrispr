---
title: "contracts:verify"
---

Submit Solidity Standard JSON Input source code to Etherscan V2 for verification at <address>. Mirror an existing verification with --mirror-chain / --mirror-address, or supply source explicitly with --source.

## Syntax

```evml
contracts:verify <address>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Deployed contract address on the current chain to verify. |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--mirror-chain` | `chain` | Chain (id or viem name like `optimism`) to mirror an existing verification from. Defaults to the current chain when only --mirror-address is set. |
| `--mirror-address` | `address` | Existing verified contract to mirror. Defaults to <address> when only --mirror-chain is set. |
| `--source` | `string` | Solidity Standard JSON Input text including language, sources, and settings. Required for explicit (non-mirror) mode. |
| `--contract-name` | `string` | Qualified contract name `path/File.sol:ContractName`. Required for explicit mode. |
| `--compiler` | `string` | Solidity compiler version, e.g. `0.8.20+commit.a1b79de6`. Required for explicit mode. |
| `--license` | `string` | SPDX license identifier (e.g. MIT, Apache-2.0). Defaults to `None` in explicit mode; mirrored in mirror mode. |
| `--constructor` | `string` | Constructor signature like `constructor(uint256,address)`. Requires --constructor-args. |
| `--constructor-args` | `array` | Constructor arguments as an array literal, e.g. [100e18 @me]. Requires --constructor. |
| `--constructor-args-hex` | `bytes` | Pre-encoded ABI constructor arguments as hex. Mutually exclusive with --constructor / --constructor-args. |
| `--timeout` | `number` | Maximum seconds to wait for verification to complete. Defaults to 60. |
| `--poll-interval` | `number` | Seconds between status polls. Defaults to 3. |

<!-- HAND-WRITTEN -->

## Examples

```evml
load contracts

# Mirror SAME address from a DIFFERENT chain (the canonical cross-chain re-verify)
contracts:verify 0x44fA8E6f47987339850636F88629646662444217 --mirror-chain 1

# Mirror a DIFFERENT address on the SAME chain
# (e.g. clone an already-verified implementation onto a freshly deployed copy)
set $newDeploy 0x0102030405060708090a0b0c0d0e0f1011121314
set $alreadyVerified 0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9
contracts:verify $newDeploy --mirror-address $alreadyVerified

# Mirror a DIFFERENT address on a DIFFERENT chain
set $mainnetSibling 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
contracts:verify $newDeploy --mirror-chain 1 --mirror-address $mainnetSibling

# Mirror with overridden constructor arguments
# (typical when an immutable like `owner` differs across chains)
set $myToken 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
contracts:verify $myToken --mirror-chain 1 --constructor "constructor(address)" --constructor-args [@me]

# Pair with deploy: same source, deterministic CREATE2 address on a new chain
contracts:deploy $token 0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe --create2 0x0000000000000000000000000000000000000000000000000000000000000001 --constructor "constructor(string,uint8)" --constructor-args ["MyToken" 18]
contracts:verify $token --mirror-chain 1 --constructor "constructor(string,uint8)" --constructor-args ["MyToken" 18]

# Explicit Standard JSON Input fetched from a URL
load http [@fetch]
set $src @fetch("https://gist.githubusercontent.com/me/abc/raw/input.json")
contracts:verify 0x44fA8E6f47987339850636F88629646662444217 --source $src --contract-name "src/MyToken.sol:MyToken" --compiler "0.8.20+commit.a1b79de6"
```

## Modes

- **Mirror mode** is activated by either `--mirror-chain` or `--mirror-address`. The
  command pulls the verified source from Etherscan via `getsourcecode` and
  resubmits it on the **current chain** for `<address>`. The other selector
  defaults so all three combinations are reachable:
  - same address, different chain  → only `--mirror-chain`
  - different address, same chain  → only `--mirror-address`
  - different address, different chain → both
  Settings (optimizer, evmVersion, libraries) and the original constructor
  arguments are preserved by default; supply `--constructor` /
  `--constructor-args` to override per-deployment differences (e.g.
  immutable `owner` set to `@me` on the new chain).
- **Explicit mode** is the default when no mirror selector is set. It accepts
  a Solidity Standard JSON Input via `--source` plus the qualified
  `--contract-name` and `--compiler`. The JSON itself encodes optimizer,
  evmVersion, and libraries — there are intentionally no separate
  `--evm-version` or `--optimizer-runs` opts.

## Source format

`verify` only supports **Solidity Standard JSON Input** for explicit-mode
submissions. The JSON encodes everything Etherscan needs to compile:

```json
{
  "language": "Solidity",
  "sources": { "src/Foo.sol": { "content": "// SPDX ..." } },
  "settings": { "optimizer": { "enabled": true, "runs": 200 }, "evmVersion": "paris" }
}
```

This is exactly what foundry and hardhat emit out of the box (foundry:
`metadata.solcInput` in `out/<Contract>.sol/<Contract>.json`; hardhat:
`input` in `artifacts/build-info/*.json`). For mirror mode the source is
fetched from the source chain — no source format choice is exposed because
the command always submits `solidity-standard-json-input` after
normalising whatever shape Etherscan returns.

### Delivering `--source`

DSL string literals come in two flavors and **neither supports escapes**:
`"..."` cannot contain `"`, and `'...'` cannot contain `'`. The two
practical patterns:

1. Fetch via `@fetch` from the `http` module — recommended for any
   non-trivial input:

```evml
load contracts
load http [@fetch]
set $src @fetch("https://gist.githubusercontent.com/me/abc/raw/input.json")
contracts:verify 0x44fA8E6f47987339850636F88629646662444217 --source $src --contract-name "src/Foo.sol:Foo" --compiler "0.8.20+commit.a1b79de6"
```

2. Inline single-quoted multi-line literal — fine for tiny payloads,
   provided no `'` appears anywhere inside the JSON:

```evml
load contracts
contracts:verify 0x44fA8E6f47987339850636F88629646662444217 --source '{
  "language": "Solidity",
  "sources": { "Foo.sol": { "content": "// SPDX ..." } },
  "settings": { "optimizer": { "enabled": true, "runs": 200 } }
}' --contract-name "Foo.sol:Foo" --compiler "0.8.20+commit.a1b79de6"
```

## Caveats

- A command and all of its options must be written on a single line — EVML
  has no `\` line continuation. (Quoted strings may span lines, as in the
  inline `--source` example above.)
- Requires the `VITE_ETHERSCAN_API_KEY` environment variable. The same key
  is used by hover-card lookups; Etherscan V2's free tier covers 60+
  chains under one key.
- The `deploy` transaction must be **mined** before `verify` runs — Etherscan
  reads the deployed runtime bytecode at `<address>`. In practice this
  means `verify` should not appear inside a `batch (...)` block alongside
  the deploy; run it as a follow-up command after the deploy confirms.
- Verification is opaque to the deployment method. CREATE, Arachnid CREATE2,
  and CreateX CREATE3 deployments all verify identically because Etherscan
  compares deployed runtime bytecode rather than replaying the deployment
  transaction.
- For deterministic cross-chain re-deploys (CREATE2 / CREATE3), compile
  identically on every chain (same Standard JSON, same compiler version).
  Any divergence in metadata-affecting settings changes the metadata hash
  embedded in the deployed bytecode — and therefore the contract address.
- The poll loop waits up to `--timeout` seconds (default 60) and polls
  every `--poll-interval` seconds (default 3). Increase `--timeout` for
  large standard JSONs that take Etherscan longer to compile.

## See Also

- [deploy](deploy.md) — deploy a contract whose address you can then pass to `verify`
- [@fetch](../../../http/src/helpers/fetch.md) — fetch a Standard JSON Input from a URL for `--source`
