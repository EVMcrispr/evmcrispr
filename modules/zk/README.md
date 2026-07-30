# zk module

Zero-knowledge proof helpers for EVML scripts: BN254 field arithmetic and circomlib Poseidon hashing, Poseidon Merkle trees (LeanIMT and fixed-depth), Groth16 proving from pre-built circom artifacts via snarkjs, and verifier-calldata accessors for on-chain proof verification.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load zk
```

## Commands

| Command | Description |
|---------|-------------|
| [zk:prove](src/commands/prove.md) | Generate a proof with snarkjs (groth16, plonk or fflonk) and bind the result (proof + public signals, as JSON) to <variable>. Prove from pre-built artifacts (--wasm/--zkey, system auto-detected from the zkey) or compile a circuit in-place (--circom; groth16 setups are DEV-ONLY, plonk/fflonk are deterministic). Read the verifier-call arguments back with @zk:proof. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@zk:circom.constraints](src/helpers/circom.constraints.md) | `number` | Compile circom source (inline text or a http/ipfs URL) and return its constraint count — useful to size the powers-of-tau a setup needs (a 2^p ptau supports up to 2^p constraints). |
| [@zk:circom.verifier](src/helpers/circom.verifier.md) | `string` | Compile circom source (inline text or a http/ipfs URL), run an in-place setup, and return the Solidity verifier source with the verification key embedded — pipe it into @contracts:solidity to deploy. groth16 setups are DEV-ONLY (no ceremony); plonk/fflonk setups are deterministic and production-grade given a real powers-of-tau. |
| [@zk:circom.vkey](src/helpers/circom.vkey.md) | `string` | Compile circom source, run the in-place setup and return the verification key as JSON — feed it to @zk:verify for off-chain checks. Shares the compile and setup caches with @zk:circom.verifier and zk:prove --circom. |
| [@zk:eddsa.pub](src/helpers/eddsa.pub.md) | `array` | Derive the EdDSA public key (a Baby Jubjub point, as an [x y] pair) from a secret — the circom-ecosystem signature scheme used by Semaphore and MACI identities. The secret is sensitive: anything bound to a variable can be printed. |
| [@zk:eddsa.sign](src/helpers/eddsa.sign.md) | `array` | Sign a field-element message with EdDSA over Baby Jubjub (Poseidon variant), returning the signature as [R8x R8y S] — destructure or pass whole to @zk:eddsa.verify or into circuit inputs. |
| [@zk:eddsa.verify](src/helpers/eddsa.verify.md) | `bool` | Verify an EdDSA (Baby Jubjub, Poseidon variant) signature: the [R8x R8y S] array from @zk:eddsa.sign against a message and an [x y] public key. |
| [@zk:field](src/helpers/field.md) | `number` | Reduce a value into the BN254 scalar field: values >= the field prime wrap around and negative values wrap to p - |x| (the circom convention). |
| [@zk:field.bits](src/helpers/field.bits.md) | `array` | Decompose a value into its bits, least-significant first — e.g. a Merkle path index into the per-level indices a circuit expects. |
| [@zk:field.hash](src/helpers/field.hash.md) | `number` | Hash hex bytes with keccak256 and reduce the digest into the BN254 scalar field — the standard way to map addresses, strings or arbitrary data into a circuit input. |
| [@zk:field.rand](src/helpers/field.rand.md) | `number` | Generate a uniformly random BN254 field element (rejection-sampled, no modulo bias) — for secrets, trapdoors and commitment salts. |
| [@zk:poseidon](src/helpers/poseidon.md) | `number` | Hash 1-16 field elements with the circomlib Poseidon permutation over the BN254 scalar field (the hash used by Semaphore, Tornado and most circom circuits). |
| [@zk:proof](src/helpers/proof.md) | `array` | Project the proof JSON bound by zk:prove into the argument tuple of its snarkjs-exported verifier: [a b c signals] for groth16 (pi_b already swapped for the on-chain pairing check), [proof signals] for plonk/fflonk (a flat 24-element array). Destructure with `set [$a $b $c $signals] @zk:proof($proof)` or `set [$p $signals] @zk:proof($proof)`. |
| [@zk:tree.proof](src/helpers/tree.proof.md) | `array` | Generate the Poseidon Merkle inclusion proof for the leaf at the given index, as a `[pathIndex siblings]` pair ready for destructuring — or `[pathIndex siblings length]` with `pad:<n>`, which zero-pads lean siblings to the fixed length circuits expect. Fixed-depth proofs always have exactly `depth` siblings; lean proofs skip levels without one and compress the path index accordingly. |
| [@zk:tree.root](src/helpers/tree.root.md) | `number` | Compute the Poseidon Merkle root of an array of field-element leaves. A single-leaf lean tree has root = leaf. |
| [@zk:tree.verify](src/helpers/tree.verify.md) | `bool` | Verify a Poseidon Merkle inclusion proof against a root, using the path index and siblings produced by @zk:tree.proof. |
| [@zk:verify](src/helpers/verify.md) | `bool` | Verify a proof off-chain against a verification key (groth16, plonk or fflonk auto-detected from the proof) — no deployed verifier needed. Get the vkey from @zk:circom.vkey or a hosted vkey JSON. |

