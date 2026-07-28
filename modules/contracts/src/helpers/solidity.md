---
title: "@contracts:solidity"
experimental: true
---

Compile Solidity source (inline text or a http/ipfs URL) and return the creation bytecode, ready for `deploy`. Options: version:<x.y.z>, runs:<n>, optimizer:off, via-ir, evm:<version>, contract:<Name>.

**Experimental** — requires `VITE_PUBLIC_EXPERIMENTAL=true`.

**Returns**: `bytes`

## Syntax

```evml
@contracts:solidity(source ...options)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | Solidity source code, or a URL to fetch it from |
| `[...options]` | `string` | Compiler options, e.g. `version:0.8.26`, `runs:1000`, `via-ir` |

## Examples

```evml
# Compile and deploy an inline contract
set $src <<<SOL
pragma solidity 0.8.26;
contract Counter {
  uint256 public n;
  function inc() public { n++; }
}
SOL
contracts:deploy $counter @contracts:solidity($src)

# Compile a contract hosted at a URL with custom compiler options
set $url 'https://sources.example.com/Counter.sol'
contracts:deploy $counter @contracts:solidity($url 'runs:1000' 'via-ir')
```

<!-- HAND-WRITTEN -->

## Compiler options

Options are passed as trailing string arguments, in any order:

| Option | Effect | Default |
|--------|--------|---------|
| `version:0.8.26` | Pin a compiler release | Newest release satisfying the root file's `pragma solidity` |
| `runs:1000` | Optimizer runs (implies the optimizer is enabled) | `200` |
| `optimizer:off` | Disable the optimizer | Optimizer enabled |
| `via-ir` | Compile through the Yul IR pipeline (`settings.viaIR`) | Off |
| `evm:cancun` | Target EVM version (`settings.evmVersion`) | Compiler default |
| `contract:MyToken` | Pick the target contract when several are deployable | Auto: single deployable contract in the root file, else root file-name match |

Unknown options throw, so typos never silently change compiler settings. The oldest supported release is `0.6.0`.

## Imports

Imports are prefetched transitively before compiling:

- **Absolute URLs** (`import "https://…/Lib.sol";`) are fetched as written.
- **Relative imports** work when the importing file lives at a URL (resolved against it). In inline source they throw — flatten the contract or host it.
- **npm-style imports** (`import "@openzeppelin/contracts/token/ERC20/ERC20.sol";`) resolve through [unpkg](https://unpkg.com). Pin a package version inside the import path (`@openzeppelin/contracts@5.0.2/…`); unversioned paths resolve to the latest release.

## Deploy + verify pipeline

The four `@solidity` helpers share one compile cache, so a deploy + verify script compiles once. Repeat the same options in every call — different options are a different compile. `verify` needs a `VITE_ETHERSCAN_API_KEY`, so the full pipeline is not runnable as a doc example:

```
load contracts
set $url 'https://raw.githubusercontent.com/me/repo/main/Token.sol'
contracts:deploy $token @contracts:solidity($url 'runs:1000')
contracts:verify $token --source @contracts:solidity.standardJson($url 'runs:1000') --contract-name @contracts:solidity.contract($url 'runs:1000') --compiler @contracts:solidity.compiler($url 'runs:1000')
```

The compiler itself (~9 MB) is downloaded from [binaries.soliditylang.org](https://binaries.soliditylang.org) on first use and cached for the session.

## See Also

- [@contracts:solidity.standardJson](solidity.standardJson.md) — the standard-json input for `verify --source`
- [@contracts:solidity.contract](solidity.contract.md) — the qualified name for `verify --contract-name`
- [@contracts:solidity.compiler](solidity.compiler.md) — the compiler version for `verify --compiler`
- [deploy](../commands/deploy.md) — deploy the compiled bytecode
- [verify](../commands/verify.md) — submit the source for verification
