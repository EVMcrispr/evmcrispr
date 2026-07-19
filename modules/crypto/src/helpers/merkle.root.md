---
title: "@crypto:merkle.root"
---

Compute the Merkle root of an array of bytes32 leaves. A single-leaf tree has root = leaf.

**Returns**: `bytes32`

## Syntax

```evml
@crypto:merkle.root(leaves mode?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `leaves` | `array` | Array of bytes32 leaves, in tree order |
| `[mode]` | `string` | Pair hashing mode: sorted (default, OpenZeppelin MerkleProof convention) or unsorted (positional, e.g. Hop transfer roots) |

## Examples

```evml
# Compute the Merkle root of a set of leaves (sorted pairs, OpenZeppelin convention)
set $leaves [0x1111111111111111111111111111111111111111111111111111111111111111 0x2222222222222222222222222222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333333333333333333333333333]
print "Root:" @crypto:merkle.root($leaves)

# Compute a Hop transfer root: positional (unsorted) tree of transferIds — a single-transfer batch has root = transferId
set $transferId 0x234fe879ff0c72a91cb174831cc3eb9477813cea707dc07774ab4272db54d4e3
print "Transfer root:" @crypto:merkle.root([$transferId] "unsorted")
```

<!-- HAND-WRITTEN -->

## Notes

- **`sorted` mode** hashes each pair in ascending order, so proofs verify with
  OpenZeppelin's `MerkleProof.verify` and no positional data. The tree layout
  matches `SimpleMerkleTree` from
  [@openzeppelin/merkle-tree](https://github.com/OpenZeppelin/merkle-tree) for
  the same leaf order (the OZ library additionally sorts leaves by default —
  pre-sort them to reproduce those roots exactly).
- **`unsorted` mode** hashes pairs positionally (left ++ right) and pairs a
  trailing odd node with itself; verification folds the leaf index one bit per
  sibling, like Optimism/Hop `Lib_MerkleTree.verify`.
- The leaves are used as-is: hash them first (e.g. with `@id` or
  `@abi.encodePacked`) if they are not already bytes32 digests.

## See Also

- [@crypto:merkle.proof](./merkle.proof.md)
- [@crypto:merkle.verify](./merkle.verify.md)
