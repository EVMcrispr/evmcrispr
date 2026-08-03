---
title: "@circom:vkey"
---

Compile circom source, run the in-place setup and return the verification key as JSON — feed it to @circom:verify for off-chain checks. Shares the compile and setup caches with @circom:verifier and circom:prove --circom.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@circom:vkey(source ptau:<value> system:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | circom source code, or a http(s)/ipfs URL to fetch it from |
| `ptau:` | `string` | Powers-of-tau: `ptau:dev` or `ptau:<url>` (default: auto-download a hez file sized to the circuit) |
| `system:` | `string` | Proof system: `system:groth16|plonk|fflonk` (default groth16) |

<!-- HAND-WRITTEN -->

## See Also

- [@circom:verify](verify.md) — off-chain verification with this key
- [@circom:verifier](verifier.md) — the on-chain counterpart from the same cached setup
