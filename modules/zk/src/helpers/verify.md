---
title: "@zk:verify"
---

Verify a proof off-chain against a verification key (groth16, plonk or fflonk auto-detected from the proof) — no deployed verifier needed. Get the vkey from @zk:circom.vkey or a hosted vkey JSON.

**Returns**: `bool`

## Syntax

```evml
@zk:verify(proof vkey)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proof` | `string` | Proof JSON string bound by zk:prove |
| `vkey` | `string` | Verification key JSON (from @zk:circom.vkey, @http:fetch or @ipfs.get) |

<!-- HAND-WRITTEN -->

## Examples

```
load zk
zk:prove $proof --circom $src --ptau dev --system plonk --inputs [a:3 b:11]
set $vkey @zk:circom.vkey($src ptau:dev system:plonk)
print "Valid:" @zk:verify($proof $vkey)
```

## See Also

- [@zk:circom.vkey](circom.vkey.md) — export the key from an in-place setup
- [zk:prove](../commands/prove.md) — binds the proof JSON this helper consumes
