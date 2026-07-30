---
title: "@zk:tree.root"
---

Compute the Poseidon Merkle root of an array of field-element leaves. A single-leaf lean tree has root = leaf.

**Returns**: `number`

## Syntax

```evml
@zk:tree.root(leaves mode?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `leaves` | `array` | Array of field-element leaves, in insertion order |
| `[mode]` | `string` | Tree mode: `lean` (default, Semaphore v4 LeanIMT) or `depth:<n>` for a zero-padded fixed-depth tree |

## Examples

```evml
# Compute the Poseidon Merkle root of a group of members
set $members [1234 5678 9012]
print "Root:" @zk:tree.root($members)
```

<!-- HAND-WRITTEN -->

## Notes

- `lean` (default) is a port of zk-kit's LeanIMT, the tree used by Semaphore v4: depth grows with the leaf count, missing right children are propagated up unchanged, and a single-leaf tree has root = leaf.
- `depth:<n>` builds a zero-padded incremental tree of static depth (Tornado-style contracts, Semaphore v3): missing children are replaced by the zero chain `Z0 = 0`, `Z(i+1) = poseidon(Zi Zi)`, and the empty-subtree roots match the widely deployed `MerkleTreeWithHistory` zeros.
- Leaves are field elements in insertion order — the tree is positional, never sorted.

## See Also

- [@zk:tree.proof](tree.proof.md) — inclusion proofs for these trees
- [@zk:tree.verify](tree.verify.md) — verify a proof against the root
