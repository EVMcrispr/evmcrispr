---
title: "@contracts:solidity.contract"
experimental: true
---

Compile Solidity source (inline text or a http/ipfs URL) and return the qualified contract name (`File.sol:Contract`), ready for `verify --contract-name`. Pass the same options as the matching @solidity call so the cached compile is reused.

**Experimental** — requires `VITE_PUBLIC_EXPERIMENTAL=true`.

**Returns**: `string`

## Syntax

```evml
@contracts:solidity.contract(source ...options)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | Solidity source code, or a URL to fetch it from |
| `[...options]` | `string` | Compiler options, e.g. `version:0.8.26`, `runs:1000`, `via-ir` |

## Examples

```evml
# Get the qualified contract name for verification
set $name @contracts:solidity.contract('https://sources.example.com/Counter.sol')
print $name
```

<!-- HAND-WRITTEN -->

## See Also
