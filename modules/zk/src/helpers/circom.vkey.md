---
title: "@zk:circom.vkey"
---

Compile circom source, run the in-place setup and return the verification key as JSON — feed it to @zk:verify for off-chain checks. Shares the compile and setup caches with @zk:circom.verifier and zk:prove --circom.

**Returns**: `string`

## Syntax

```evml
@zk:circom.vkey(source ...options)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | circom source code, or a http(s)/ipfs URL to fetch it from |
| `[...options]` | `string` | Setup options: ptau:dev, ptau:<url>, system:groth16|plonk|fflonk |

<!-- HAND-WRITTEN -->

## See Also

- [@zk:verify](verify.md) — off-chain verification with this key
- [@zk:circom.verifier](circom.verifier.md) — the on-chain counterpart from the same cached setup
