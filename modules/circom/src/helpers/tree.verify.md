---
title: "@circom:tree.verify"
---

Verify a Poseidon Merkle inclusion proof against a root, using the path index and siblings produced by @circom:tree.proof.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@circom:tree.verify(root leaf index proof lean:<value> depth:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `root` | `number` | Merkle root |
| `leaf` | `number` | Leaf to prove |
| `index` | `number` | Path index from @circom:tree.proof (equals the leaf index for fixed-depth and complete lean trees) |
| `proof` | `array` | Array of sibling field elements, leaf to root |
| `lean:` | `bool` | `lean:true` — Semaphore v4 LeanIMT (the default when depth: is not set) |
| `depth:` | `number` | `depth:<n>` — zero-padded fixed-depth tree |

## Examples

```evml
# Check a member's inclusion proof off-chain
set $leaves [1234 5678 9012]
set $root @circom:tree.root($leaves)
set [$index $siblings] @circom:tree.proof($leaves 2)
print "Member included:" @circom:tree.verify($root 9012 $index $siblings)
```

<!-- HAND-WRITTEN -->

## Notes

- `index` is the path index returned by [@circom:tree.proof](tree.proof.md), not necessarily the leaf position (they differ for incomplete lean trees).
- Fixed-depth proofs must have exactly `depth` siblings.

## See Also

- [@circom:tree.proof](tree.proof.md) — produces `[pathIndex siblings]`
- [@circom:tree.root](tree.root.md) — the tree conventions
