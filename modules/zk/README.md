# zk module

Zero-knowledge proof helpers for EVML scripts: BN254 field arithmetic and circomlib Poseidon hashing, Poseidon Merkle trees (LeanIMT and fixed-depth), Groth16 proving from pre-built circom artifacts via snarkjs, and verifier-calldata accessors for on-chain proof verification.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load zk
```

## Commands

| Command | Description |
|---------|-------------|
| [zk:prove](src/commands/prove.md) | Generate a Groth16 proof with snarkjs from pre-built circom artifacts and bind the result (proof + public signals, as JSON) to <variable>. Read the verifier-call arguments back with @zk:proof. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@zk:field](src/helpers/field.md) | `number` | Reduce a value into the BN254 scalar field: values >= the field prime wrap around and negative values wrap to p - |x| (the circom convention). |
| [@zk:field.hash](src/helpers/field.hash.md) | `number` | Hash hex bytes with keccak256 and reduce the digest into the BN254 scalar field — the standard way to map addresses, strings or arbitrary data into a circuit input. |
| [@zk:poseidon](src/helpers/poseidon.md) | `number` | Hash 1-16 field elements with the circomlib Poseidon permutation over the BN254 scalar field (the hash used by Semaphore, Tornado and most circom circuits). |
| [@zk:proof](src/helpers/proof.md) | `array` | Project the proof JSON bound by zk:prove into the `[a b c signals]` argument tuple of a snarkjs-exported Groth16 verifier (pi_b already swapped for the on-chain pairing check). Destructure it with `set [$a $b $c $signals] @zk:proof($proof)`. |
| [@zk:tree.proof](src/helpers/tree.proof.md) | `array` | Generate the Poseidon Merkle inclusion proof for the leaf at the given index, as a `[pathIndex siblings]` pair ready for destructuring. Fixed-depth proofs always have exactly `depth` siblings; lean proofs skip levels without one and compress the path index accordingly. |
| [@zk:tree.root](src/helpers/tree.root.md) | `number` | Compute the Poseidon Merkle root of an array of field-element leaves. A single-leaf lean tree has root = leaf. |
| [@zk:tree.verify](src/helpers/tree.verify.md) | `bool` | Verify a Poseidon Merkle inclusion proof against a root, using the path index and siblings produced by @zk:tree.proof. |

