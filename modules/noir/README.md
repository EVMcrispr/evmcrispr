# noir module

Noir circuit tooling for EVML scripts: in-place compilation of Noir source, UltraHonk proving and off-chain verification via Barretenberg, and Solidity verifier generation for on-chain proof verification.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load noir
```

## Commands

| Command | Description |
|---------|-------------|
| [noir:prove](src/commands/prove.md) | Generate an UltraHonk proof with Barretenberg and bind the result (proof + public inputs, as JSON) to <variable>. Compile Noir source in-place (--noir) or prove from a pre-built compiled-program artifact (--artifact). Defaults to the keccak transcript so proofs verify on-chain against the @noir:verifier contract; read the verifier-call arguments back with @noir:proof. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@noir:compile](src/helpers/compile.md) | `string` | Compile Noir source in-place and return the compiled program artifact as JSON (the nargo target/*.json shape, debug payload stripped) — host it and prove later with noir:prove --artifact. Single-file circuits with the stdlib only; shares the compile cache with the other @noir helpers and noir:prove --noir. |
| [@noir:proof](src/helpers/proof.md) | `array` | Project the proof JSON bound by noir:prove into the argument tuple of its Solidity UltraHonk verifier: [proof publicInputs] for verify(bytes,bytes32[])(bool). Destructure with `set [$p $signals] @noir:proof($proof)`. |
| [@noir:verifier](src/helpers/verifier.md) | `string` | Compile Noir source and return the Solidity UltraHonk verifier contract source (always the keccak/EVM transcript) — pipe it through @contracts:solidity and contracts:deploy, then call verify(bytes,bytes32[])(bool) with the tuple from @noir:proof. Shares the compile cache with noir:prove --noir, so deployed verifier and generated proofs always match. |
| [@noir:verify](src/helpers/verify.md) | `bool` | Verify an UltraHonk proof off-chain against a verification key — no deployed verifier needed. The transcript (keccak or poseidon) is auto-detected from the proof JSON; the vkey must come from @noir:vkey with the matching oracle. |
| [@noir:vkey](src/helpers/vkey.md) | `string` | Compile Noir source and return its UltraHonk verification key as 0x-hex bytes — feed it to @noir:verify for off-chain checks. Defaults to the keccak (EVM) transcript so it matches proofs from noir:prove; pass oracle:poseidon for bb's native transcript. |

