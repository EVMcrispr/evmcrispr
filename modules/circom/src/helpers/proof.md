---
title: "@circom:proof"
---

Project the proof JSON bound by circom:prove into the argument tuple of its snarkjs-exported verifier: [a b c signals] for groth16 (pi_b already swapped for the on-chain pairing check), [proof signals] for plonk/fflonk (a flat 24-element array). Destructure with `set [$a $b $c $signals] @circom:proof($proof)` or `set [$p $signals] @circom:proof($proof)`.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@circom:proof(proof)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proof` | `string` | Proof JSON string bound by circom:prove |

<!-- HAND-WRITTEN -->

## Examples

The result is the argument tuple of a snarkjs-exported `Groth16Verifier`, with `pi_b` already swapped into the pairing-precompile coordinate order. Destructure it and splat the parts into `verifyProof`:

```
load circom
load lang
circom:prove $proof --wasm ipfs://<wasm-cid> --zkey ipfs://<zkey-cid> --inputs [a:3 b:11]
set [$a $b $c $signals] @circom:proof($proof)
print "Output signal:" @lang:at($signals 0)
print "Valid:" @get($verifier "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1])(bool)" $a $b $c $signals)
```

The number of public signals (`uint256[1]` above) depends on the circuit — match it in the ABI signature.

## See Also

- [prove](../commands/prove.md) — binds the proof JSON this helper consumes
- [@lang:at](../../../lang/src/helpers/at.md) — pick a single public signal out of `$signals`
