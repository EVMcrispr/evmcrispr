---
title: "noir:prove"
---

Generate an UltraHonk proof with Barretenberg and bind the result (proof + public inputs, as JSON) to <variable>. Compile Noir source in-place (--noir) or prove from a pre-built compiled-program artifact (--artifact). Defaults to the keccak transcript so proofs verify on-chain against the @noir:verifier contract; read the verifier-call arguments back with @noir:proof.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
noir:prove <variable>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the proof JSON string to |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--noir` | `string` | Noir source (or a http(s)/ipfs URL) to compile in-place instead of --artifact — single-file circuits with the stdlib only |
| `--artifact` | `string` | URL (http(s):// or ipfs://) of a compiled Noir program artifact (nargo target/*.json or @noir:compile output); supports a #sha256=0x… integrity pin |
| `--oracle` | `string` | Proof transcript: keccak (default; verifiable on-chain by the @noir:verifier contract) or poseidon (bb's native transcript, off-chain use only) |
| `--inputs` | `any` | Circuit inputs: an entries array like [[x 3] [y 11]] (nest values for array inputs), or a JSON object string (required for struct inputs) |

## Examples

```evml
# Prove a statement about a secret and check the proof off-chain — here: I know an x that differs from the public y
set $src <<<NOIR
fn main(x: Field, y: pub Field) {
    assert(x != y);
}
NOIR
noir:prove $proof --noir $src --inputs [[x 3] [y 5]]
print "Valid:" @noir:verify($proof @noir:vkey($src))
```

<!-- HAND-WRITTEN -->

## Inputs

`--inputs` takes the circuit's `main()` parameters by name, as a record:
`[x:3 y:5]` — sugar for the equivalent entries array `[[x 3] [y 5]]`,
which is accepted too. Values may be numbers, decimal or hex strings,
booleans, or nested arrays for array parameters. A JSON object string is
also accepted (quote it with single quotes), and is the only way to pass
struct-typed inputs — the shape follows a `Prover.toml` converted to JSON.

## Compiling in-place (--noir)

`--noir` compiles the given source (inline heredoc or URL) with the
bundled Noir compiler. Circuits are single-file with the stdlib
(`std::…`) available; external Nargo `[dependencies]` are git-fetched by
nargo itself and cannot be resolved here — inline the code instead.
Compiles are cached per source for the session and shared with the
`@noir:*` helpers, so the verifier a script deploys always matches the
proofs it generates.

`--artifact` proves from a pre-built compiled-program JSON instead (a
nargo `target/*.json` or hosted `@noir:compile` output). Append
`#sha256=0x…` to the URL to pin the artifact's hash; `ipfs://` content is
already verified against its CID.

## Oracles

UltraHonk proofs commit to a transcript hash:

- **keccak** (default): what the `@noir:verifier` Solidity contract
  expects — proofs verify both on-chain and off-chain.
- **poseidon**: bb's native transcript — cheaper to prove, off-chain
  (`@noir:verify`) use only.

The bound proof JSON records its oracle, so `@noir:verify` always checks
against the right transcript. Unlike groth16, UltraHonk needs no
circuit-specific trusted setup — there is no ceremony to fake and no
dev-only caveat.

Barretenberg downloads its SRS points (Aztec's ignition ceremony) from
`crs.aztec-labs.com` on the first proof of a session and caches them.

## See Also

- [@noir:proof](../helpers/proof.md) — project the bound proof into the on-chain verifier's argument tuple
- [@noir:verify](../helpers/verify.md) — check a proof off-chain
- [@noir:verifier](../helpers/verifier.md) — generate the Solidity verifier to deploy
- [@noir:compile](../helpers/compile.md) — produce the artifact `--artifact` consumes
