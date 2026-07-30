---
title: "@contracts:solidity.contract"
experimental: true
sidebar:
  label: "@contracts:solidity.contract ⚗️"
---

Compile Solidity source (inline text or a http/ipfs URL) and return the qualified contract name (`File.sol:Contract`), ready for `verify --contract-name`. Pass the same options as the matching @solidity call so the cached compile is reused.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@contracts:solidity.contract(source version:<value> runs:<value> optimizer:<value> via-ir:<value> evm:<value> contract:<value>)
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
# Get the qualified contract name for verification
set $name @contracts:solidity.contract('https://sources.example.com/Counter.sol')
print $name
```

<!-- HAND-WRITTEN -->

## See Also
