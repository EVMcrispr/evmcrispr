---
title: "@crypto:merkle.proof"
---

Generate the Merkle inclusion proof (array of sibling hashes) for the leaf at the given index. A single-leaf tree has an empty proof.

**Returns**: `array`

## Syntax

```evml
@crypto:merkle.proof(leaves index mode?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `leaves` | `array` | Array of bytes32 leaves, in tree order |
| `index` | `number` | Zero-based position of the leaf to prove |
| `[mode]` | `string` | Pair hashing mode: sorted (default, OpenZeppelin MerkleProof convention) or unsorted (positional, e.g. Hop transfer roots) |

## Examples

```evml
# Generate the inclusion proof for the first leaf
set $leaves [0x1111111111111111111111111111111111111111111111111111111111111111 0x2222222222222222222222222222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333333333333333333333333333]
print "Proof:" @crypto:merkle.proof($leaves 0)

# Hop-style withdrawal siblings: the only transfer of a batch needs no siblings (empty proof)
set $siblings @crypto:merkle.proof([0x234fe879ff0c72a91cb174831cc3eb9477813cea707dc07774ab4272db54d4e3] 0 "unsorted")
print "Siblings:" $siblings
```

<!-- HAND-WRITTEN -->

## Notes

- The proof lists sibling hashes from the leaf up to (but excluding) the root.
- Proofs generated in `sorted` mode (the default) verify with OpenZeppelin's
  `MerkleProof.verify`; `unsorted` proofs are positional and must be checked
  together with the leaf index (e.g. Hop withdrawal `siblings`).

## See Also

- [@crypto:merkle.root](./merkle.root.md)
- [@crypto:merkle.verify](./merkle.verify.md)
