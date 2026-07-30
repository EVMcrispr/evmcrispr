---
title: "@zk:tree.proof"
---

Generate the Poseidon Merkle inclusion proof for the leaf at the given index, as a `[pathIndex siblings]` pair ready for destructuring. Fixed-depth proofs always have exactly `depth` siblings; lean proofs skip levels without one and compress the path index accordingly.

**Returns**: `array`

## Syntax

```evml
@zk:tree.proof(leaves index mode?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `leaves` | `array` | Array of field-element leaves, in insertion order |
| `index` | `number` | Zero-based position of the leaf to prove |
| `[mode]` | `string` | Tree mode: `lean` (default, Semaphore v4 LeanIMT) or `depth:<n>` for a zero-padded fixed-depth tree |

## Examples

```evml
# Prove membership: destructure the proof and verify it against the root
set $leaves [1234 5678 9012]
set $root @zk:tree.root($leaves)
set [$index $siblings] @zk:tree.proof($leaves 1)
print "Valid:" @zk:tree.verify($root 5678 $index $siblings)
```

<!-- HAND-WRITTEN -->

## Notes

- The result is a `[pathIndex siblings]` pair — destructure it with `set [$index $siblings] @zk:tree.proof(...)`.
- For fixed-depth trees and complete lean trees the path index equals the leaf index. When a lean level has no sibling, that level is skipped in both `siblings` and the packed path index (zk-kit `generateProof().index` semantics) — always thread the returned path index into circuits and [@zk:tree.verify](tree.verify.md) instead of reusing the leaf position.
- Lean circuits usually take a fixed-size sibling array: pad `$siblings` with zeros up to the circuit depth and pass the sibling count separately, as the circuit expects.

## See Also

- [@zk:tree.root](tree.root.md) — the tree conventions
- [@zk:tree.verify](tree.verify.md) — verify the generated proof
