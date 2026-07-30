---
title: "@zk:tree.verify"
---

Verify a Poseidon Merkle inclusion proof against a root, using the path index and siblings produced by @zk:tree.proof.

**Returns**: `bool`

## Syntax

```evml
@zk:tree.verify(root leaf index proof mode?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `root` | `number` | Merkle root |
| `leaf` | `number` | Leaf to prove |
| `index` | `number` | Path index from @zk:tree.proof (equals the leaf index for fixed-depth and complete lean trees) |
| `proof` | `array` | Array of sibling field elements, leaf to root |
| `[mode]` | `string` | Tree mode: `lean` (default, Semaphore v4 LeanIMT) or `depth:<n>` for a zero-padded fixed-depth tree |

## Examples

```evml
# Check a member's inclusion proof off-chain
set $leaves [1234 5678 9012]
set $root @zk:tree.root($leaves)
set [$index $siblings] @zk:tree.proof($leaves 2)
print "Member included:" @zk:tree.verify($root 9012 $index $siblings)
```

<!-- HAND-WRITTEN -->

## Notes

- `index` is the path index returned by [@zk:tree.proof](tree.proof.md), not necessarily the leaf position (they differ for incomplete lean trees).
- Fixed-depth proofs must have exactly `depth` siblings.

## See Also

- [@zk:tree.proof](tree.proof.md) — produces `[pathIndex siblings]`
- [@zk:tree.root](tree.root.md) — the tree conventions
