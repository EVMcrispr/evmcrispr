---
title: "@noir:proof"
---

Project the proof JSON bound by noir:prove into the argument tuple of its Solidity UltraHonk verifier: [proof publicInputs] for verify(bytes,bytes32[])(bool). Destructure with `set [$p $signals] @noir:proof($proof)`.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@noir:proof(proof)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proof` | `string` | Proof JSON string bound by noir:prove |

<!-- HAND-WRITTEN -->

## Examples

```
set $src <<<NOIR
fn main(x: Field, y: pub Field) {
    assert(x != y);
}
NOIR
noir:prove $proof --noir $src --inputs [x:3 y:5]
set [$p $signals] @noir:proof($proof)
exec $verifier "verify(bytes,bytes32[])(bool)" $p $signals
```

## Notes

The tuple matches the generated `HonkVerifier` ABI: `proof` as one
`bytes` blob and the public inputs as a `bytes32[]` array (one 32-byte
word per public input, in calldata order).

## See Also

- [noir:prove](../commands/prove.md) — binds the proof JSON this projects
- [@noir:verifier](verifier.md) — the contract these arguments call
