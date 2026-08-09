# crypto module

Cryptographic helpers for EVML scripts: Merkle tree utilities to compute roots, generate inclusion proofs and verify them over raw bytes32 leaves, supporting both the OpenZeppelin sorted-pair convention and positional (unsorted) trees such as Hop transfer roots.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load crypto
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@crypto:merkle.proof](src/helpers/merkle.proof.md) | `array` | Generate the Merkle inclusion proof (array of sibling hashes) for the leaf at the given index. A single-leaf tree has an empty proof. |
| [@crypto:merkle.root](src/helpers/merkle.root.md) | `bytes32` | Compute the Merkle root of an array of bytes32 leaves. A single-leaf tree has root = leaf. |
| [@crypto:merkle.verify](src/helpers/merkle.verify.md) | `bool` | Verify a Merkle inclusion proof against a root. Without an index the proof is checked with the sorted-pair convention (OpenZeppelin MerkleProof); with an index it is checked positionally (unsorted trees). As @merkle.verify! a live bytes32[] proof folds on-chain through hashPairSorted from the leaf and the reproduced root compares against the expected one (sorted-pair trees only). |

