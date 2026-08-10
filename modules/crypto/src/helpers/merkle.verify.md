---
title: "@crypto:merkle.verify"
---

Verify a Merkle inclusion proof against a root: with no index the sorted-pair convention (OpenZeppelin MerkleProof), with an index the positional one for unsorted trees.

**On-chain (`@crypto:merkle.verify!`)**: Sorted-pair trees only: the positional (indexed) form has no on-chain face.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@crypto:merkle.verify(root leaf proof index?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `root` | `bytes32` | Merkle root |
| `leaf` | `bytes32` | Leaf to prove |
| `proof` | `array` | Array of bytes32 sibling hashes, leaf to root |
| `[index]` | `number` | Zero-based leaf position for positional (unsorted) verification; omit for sorted-pair trees |

## Examples

```evml
# Check a sorted-pair inclusion proof before submitting a claim
set $root 0x87fbd8dad686d9536b2ef65757c3415df1b7a4664deb34eda3d91234936eb5fe
set $proof [0x2222222222222222222222222222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333333333333333333333333333]
print "Included:" @crypto:merkle.verify($root 0x1111111111111111111111111111111111111111111111111111111111111111 $proof)

# Verify a positional (unsorted) proof by passing the leaf index
set $root 0x6145e58f72ce6b641069ee7bd2b6af681fcbdd723a4f795f7d2939d00eb2d91d
print "Included:" @crypto:merkle.verify($root 0x3333333333333333333333333333333333333333333333333333333333333333 [0x3333333333333333333333333333333333333333333333333333333333333333 0x3e92e0db88d6afea9edc4eedf62fffa4d92bcdfc310dccbe943747fe8302e871] 2)
```

<!-- HAND-WRITTEN -->

## Notes

- Without `index`, each proof step hashes the pair in ascending order —
  exactly OpenZeppelin's `MerkleProof.verify`.
- With `index`, each proof step places the computed hash on the left when the
  current index bit is even and on the right when it is odd, then shifts the
  index — the semantics of Optimism/Hop `Lib_MerkleTree.verify`.
- An empty proof is valid exactly when `leaf` equals `root` (single-leaf tree).

## See Also

- [@crypto:merkle.root](./merkle.root.md)
- [@crypto:merkle.proof](./merkle.proof.md)

## On-chain face (@merkle.verify!)

Verify a sorted-pair (OpenZeppelin MerkleProof) inclusion proof at
assertion time: a live `bytes32[]` proof folds through a
`foldWords` with the `hashPairSorted(accumulator, sibling)` lambda at
the canonical 4/36 windows, init = leaf, Full exit — and the reproduced
root compares against the expected one with `eq`.

#
