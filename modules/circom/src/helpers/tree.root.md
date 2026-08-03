---
title: "@circom:tree.root"
---

Compute the Poseidon Merkle root of an array of field-element leaves. A single-leaf lean tree has root = leaf.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@circom:tree.root(leaves lean:<value> depth:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `leaves` | `array` | Array of field-element leaves, in insertion order |
| `lean:` | `bool` | `lean:true` — Semaphore v4 LeanIMT (the default when depth: is not set) |
| `depth:` | `number` | `depth:<n>` — zero-padded fixed-depth tree |

## Examples

```evml
# Compute the Poseidon Merkle root of a group of members
set $members [1234 5678 9012]
print "Root:" @circom:tree.root($members)
```

<!-- HAND-WRITTEN -->

## Notes

- `lean` (default) is a port of zk-kit's LeanIMT, the tree used by Semaphore v4: depth grows with the leaf count, missing right children are propagated up unchanged, and a single-leaf tree has root = leaf.
- `depth:<n>` builds a zero-padded incremental tree of static depth (Tornado-style contracts, Semaphore v3): missing children are replaced by the zero chain `Z0 = 0`, `Z(i+1) = poseidon(Zi Zi)`, and the empty-subtree roots match the widely deployed `MerkleTreeWithHistory` zeros.
- Leaves are field elements in insertion order — the tree is positional, never sorted.

## See Also

- [@circom:tree.proof](tree.proof.md) — inclusion proofs for these trees
- [@circom:tree.verify](tree.verify.md) — verify a proof against the root
