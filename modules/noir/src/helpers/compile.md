---
title: "@noir:compile"
---

Compile Noir source in-place and return the compiled program artifact as JSON (the nargo target/*.json shape, debug payload stripped), ready to host and prove later with noir:prove --artifact. Single-file circuits with the stdlib only; shares the compile cache with the other @noir helpers and noir:prove --noir.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@noir:compile(source)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | Noir source code, or a http(s)/ipfs URL to fetch it from |

<!-- HAND-WRITTEN -->

## Notes

The artifact is the nargo `target/*.json` shape with the debug payload
stripped — host it (IPFS works well) and prove from it later with
`noir:prove --artifact`, pinning the hash with a `#sha256=0x…` fragment.
Circuits are single-file with the stdlib (`std::…`) available; external
Nargo `[dependencies]` are not supported — inline the code instead.

## See Also

- [noir:prove](../commands/prove.md) — `--artifact` consumes this output
- [@noir:verifier](verifier.md) — the Solidity verifier for the same circuit
