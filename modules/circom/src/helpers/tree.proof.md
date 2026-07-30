---
title: "@circom:tree.proof"
---

Generate the Poseidon Merkle inclusion proof for the leaf at the given index, as a `[pathIndex siblings]` pair ready for destructuring — or `[pathIndex siblings length]` with `pad:<n>`, which zero-pads lean siblings to the fixed length circuits expect. Fixed-depth proofs always have exactly `depth` siblings; lean proofs skip levels without one and compress the path index accordingly.

**Returns**: `array`

## Syntax

```evml
@circom:tree.proof(leaves index lean:<value> depth:<value> pad:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `leaves` | `array` | Array of field-element leaves, in insertion order |
| `index` | `number` | Zero-based position of the leaf to prove |
| `lean:` | `bool` | `lean:true` — Semaphore v4 LeanIMT (the default when depth: is not set) |
| `depth:` | `number` | `depth:<n>` — zero-padded fixed-depth tree |
| `pad:` | `number` | `pad:<n>` — zero-pad lean siblings to a fixed length and append the real proof length |

## Examples

```evml
# Prove membership: destructure the proof and verify it against the root
set $leaves [1234 5678 9012]
set $root @circom:tree.root($leaves)
set [$index $siblings] @circom:tree.proof($leaves 1)
print "Valid:" @circom:tree.verify($root 5678 $index $siblings)
```

<!-- HAND-WRITTEN -->

## Notes

- The result is a `[pathIndex siblings]` pair — destructure it with `set [$index $siblings] @circom:tree.proof(...)`.
- For fixed-depth trees and complete lean trees the path index equals the leaf index. When a lean level has no sibling, that level is skipped in both `siblings` and the packed path index (zk-kit `generateProof().index` semantics) — always thread the returned path index into circuits and [@circom:tree.verify](tree.verify.md) instead of reusing the leaf position.
- Lean circuits usually take a fixed-size sibling array: pad `$siblings` with zeros up to the circuit depth and pass the sibling count separately, as the circuit expects.

## See Also

- [@circom:tree.root](tree.root.md) — the tree conventions
- [@circom:tree.verify](tree.verify.md) — verify the generated proof
