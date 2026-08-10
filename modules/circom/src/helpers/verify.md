---
title: "@circom:verify"
---

Verify a proof off-chain against a verification key (groth16, plonk or fflonk auto-detected from the proof), with no deployed verifier needed. Get the vkey from @circom:vkey or a hosted vkey JSON.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@circom:verify(proof vkey)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proof` | `string` | Proof JSON string bound by circom:prove |
| `vkey` | `string` | Verification key JSON (from @circom:vkey, @http:fetch or @ipfs.get) |

<!-- HAND-WRITTEN -->

## Examples

```
load circom
circom:prove $proof --circom $src --ptau dev --system plonk --inputs [a:3 b:11]
set $vkey @circom:vkey($src ptau:dev system:plonk)
print "Valid:" @circom:verify($proof $vkey)
```

## See Also

- [@circom:vkey](vkey.md) — export the key from an in-place setup
- [circom:prove](../commands/prove.md) — binds the proof JSON this helper consumes
