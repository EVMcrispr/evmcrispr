# circom module

Circom proving stack for EVML scripts: proofs from pre-built wasm/zkey artifacts or in-place circuit compilation with groth16, plonk and fflonk setups via snarkjs, BN254 field arithmetic, circomlib Poseidon hashing and Merkle trees (LeanIMT and fixed-depth), EdDSA over Baby Jubjub, and verifier-calldata accessors for on-chain proof verification.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load circom
```

## Commands

| Command | Description |
|---------|-------------|
| [circom:prove](src/commands/prove.md) | Generate a proof with snarkjs (groth16, plonk or fflonk) and bind the result (proof + public signals, as JSON) to <variable>. Prove from pre-built artifacts (--wasm/--zkey, system auto-detected from the zkey) or compile a circuit in-place (--circom; groth16 setups are DEV-ONLY, plonk/fflonk are deterministic). Read the verifier-call arguments back with @circom:proof. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@circom:constraints](src/helpers/constraints.md) | `number` | Compile circom source (inline text or a http/ipfs URL) and return its constraint count — useful to size the powers-of-tau a setup needs (a 2^p ptau supports up to 2^p constraints). |
| [@circom:eddsa.pub](src/helpers/eddsa.pub.md) | `array` | Derive the EdDSA public key (a Baby Jubjub point, as an [x y] pair) from a secret — the circom-ecosystem signature scheme used by Semaphore and MACI identities. The secret is sensitive: anything bound to a variable can be printed. |
| [@circom:eddsa.sign](src/helpers/eddsa.sign.md) | `array` | Sign a field-element message with EdDSA over Baby Jubjub (Poseidon variant), returning the signature as [R8x R8y S] — destructure or pass whole to @circom:eddsa.verify or into circuit inputs. |
| [@circom:eddsa.verify](src/helpers/eddsa.verify.md) | `bool` | Verify an EdDSA (Baby Jubjub, Poseidon variant) signature: the [R8x R8y S] array from @circom:eddsa.sign against a message and an [x y] public key. |
| [@circom:field](src/helpers/field.md) | `number` | Reduce a value into the BN254 scalar field: values >= the field prime wrap around and negative values wrap to p - |x| (the circom convention). |
| [@circom:field.bits](src/helpers/field.bits.md) | `array` | Decompose a value into its bits, least-significant first — e.g. a Merkle path index into the per-level indices a circuit expects. |
| [@circom:field.hash](src/helpers/field.hash.md) | `number` | Hash hex bytes with keccak256 and reduce the digest into the BN254 scalar field — the standard way to map addresses, strings or arbitrary data into a circuit input. |
| [@circom:field.rand](src/helpers/field.rand.md) | `number` | Generate a uniformly random BN254 field element (rejection-sampled, no modulo bias) — for secrets, trapdoors and commitment salts. |
| [@circom:poseidon](src/helpers/poseidon.md) | `number` | Hash 1-16 field elements with the circomlib Poseidon permutation over the BN254 scalar field (the hash used by Semaphore, Tornado and most circom circuits). |
| [@circom:proof](src/helpers/proof.md) | `array` | Project the proof JSON bound by circom:prove into the argument tuple of its snarkjs-exported verifier: [a b c signals] for groth16 (pi_b already swapped for the on-chain pairing check), [proof signals] for plonk/fflonk (a flat 24-element array). Destructure with `set [$a $b $c $signals] @circom:proof($proof)` or `set [$p $signals] @circom:proof($proof)`. |
| [@circom:tree.proof](src/helpers/tree.proof.md) | `array` | Generate the Poseidon Merkle inclusion proof for the leaf at the given index, as a `[pathIndex siblings]` pair ready for destructuring — or `[pathIndex siblings length]` with `pad:<n>`, which zero-pads lean siblings to the fixed length circuits expect. Fixed-depth proofs always have exactly `depth` siblings; lean proofs skip levels without one and compress the path index accordingly. |
| [@circom:tree.root](src/helpers/tree.root.md) | `number` | Compute the Poseidon Merkle root of an array of field-element leaves. A single-leaf lean tree has root = leaf. |
| [@circom:tree.verify](src/helpers/tree.verify.md) | `bool` | Verify a Poseidon Merkle inclusion proof against a root, using the path index and siblings produced by @circom:tree.proof. |
| [@circom:verifier](src/helpers/verifier.md) | `string` | Compile circom source (inline text or a http/ipfs URL), run an in-place setup, and return the Solidity verifier source with the verification key embedded — pipe it into @contracts:solidity to deploy. groth16 setups are DEV-ONLY (no ceremony); plonk/fflonk setups are deterministic and production-grade given a real powers-of-tau. |
| [@circom:verify](src/helpers/verify.md) | `bool` | Verify a proof off-chain against a verification key (groth16, plonk or fflonk auto-detected from the proof) — no deployed verifier needed. Get the vkey from @circom:vkey or a hosted vkey JSON. |
| [@circom:vkey](src/helpers/vkey.md) | `string` | Compile circom source, run the in-place setup and return the verification key as JSON — feed it to @circom:verify for off-chain checks. Shares the compile and setup caches with @circom:verifier and circom:prove --circom. |

