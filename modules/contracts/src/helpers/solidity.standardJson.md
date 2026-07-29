---
title: "@contracts:solidity.standardJson"
experimental: true
sidebar:
  label: "@contracts:solidity.standardJson ⚗️"
---

Compile Solidity source (inline text or a http/ipfs URL) and return the exact solc Standard JSON Input text, ready for `verify --source`. Pass the same options as the matching @solidity call so the cached compile is reused.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@contracts:solidity.standardJson(source ...options)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | Solidity source code, or a URL to fetch it from |
| `[...options]` | `string` | Compiler options, e.g. `version:0.8.26`, `runs:1000`, `via-ir` |

## Examples

```evml
# Inspect the compiler settings embedded in the verification payload
set $json @contracts:solidity.standardJson('https://sources.example.com/Counter.sol')
print $json
```

<!-- HAND-WRITTEN -->

## See Also
