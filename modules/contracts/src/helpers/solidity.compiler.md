---
title: "@contracts:solidity.compiler"
experimental: true
sidebar:
  label: "@contracts:solidity.compiler ⚗️"
---

Compile Solidity source (inline text or a http/ipfs URL) and return the long compiler version (`0.8.26+commit.8a97fa7a`), ready for `verify --compiler`. Pass the same options as the matching @solidity call so the cached compile is reused.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@contracts:solidity.compiler(source version:<value> runs:<value> optimizer:<value> via-ir:<value> evm:<value> contract:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | Solidity source code, or a URL to fetch it from |
| `version:` | `string` | Compiler release, e.g. `version:0.8.26` (default: from the pragma) |
| `runs:` | `number` | Optimizer runs, e.g. `runs:1000` (default: 200) |
| `optimizer:` | `bool` | `optimizer:false` disables the optimizer |
| `via-ir:` | `bool` | `via-ir:true` compiles through the IR pipeline |
| `evm:` | `string` | EVM version, e.g. `evm:cancun` |
| `contract:` | `string` | Target contract name when the source defines several |

## Examples

```evml
# Get the compiler version string for verification
set $compiler @contracts:solidity.compiler('https://sources.example.com/Counter.sol')
print $compiler
```

<!-- HAND-WRITTEN -->

## See Also
