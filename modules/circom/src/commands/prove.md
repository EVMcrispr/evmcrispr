---
title: "circom:prove"
---

Generate a proof with snarkjs (groth16, plonk or fflonk) and bind the result (proof + public signals, as JSON) to <variable>. Prove from pre-built artifacts (--wasm/--zkey, system auto-detected from the zkey) or compile a circuit in-place (--circom; groth16 setups are DEV-ONLY, plonk/fflonk are deterministic). Read the verifier-call arguments back with @circom:proof.

## Syntax

```evml
circom:prove <variable>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the proof JSON string to |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--wasm` | `string` | URL (http(s):// or ipfs://) of the compiled circuit WASM |
| `--zkey` | `string` | URL (http(s):// or ipfs://) of the final Groth16 proving key (.zkey) |
| `--circom` | `string` | circom source (or URL) to compile and set up in-place instead of --wasm/--zkey — DEV-ONLY trusted setup, never for production proofs |
| `--ptau` | `string` | Powers-of-tau for the in-place setup: dev (generate locally) or a ptau URL (default: auto-download a hez file sized to the circuit); only valid with --circom |
| `--system` | `string` | Proof system for the in-place setup: groth16 (default, DEV-ONLY), plonk or fflonk (deterministic); only valid with --circom (pre-built zkeys carry their system) |

<!-- HAND-WRITTEN -->

## Examples

```
load circom

# From pre-built artifacts (production workflow — zkey from a real ceremony)
circom:prove $proof --wasm ipfs://<wasm-cid> --zkey ipfs://<zkey-cid> --inputs [a:3 b:11]

# From circom source, DEV-ONLY in-place setup
set $src <<<CIRCOM
pragma circom 2.0.0;
template Multiplier2() {
    signal input a;
    signal input b;
    signal output c;
    c <== a * b;
}
component main = Multiplier2();
CIRCOM
circom:prove $proof --circom $src --ptau dev --inputs [a:3 b:11]

set [$a $b $c $signals] @circom:proof($proof)
exec $verifier "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1])" $a $b $c $signals

# plonk: deterministic setup, production-grade with a real ptau
circom:prove $proof --circom $src --system plonk --inputs [a:3 b:11]
set [$p $signals] @circom:proof($proof)
exec $verifier "verifyProof(uint256[24],uint256[1])" $p $signals
```

## Inputs

`--inputs` takes the circuit's input signals by name, as a record:
`[a:3 b:11]` — sugar for the equivalent entries array `[[a 3] [b 11]]`,
which is accepted too. Values may be numbers, decimal or hex strings,
booleans, or nested arrays for array signals (`[siblings:$siblings]`). A
JSON object string is also accepted, so a snarkjs `input.json` fetched
with `@ipfs.get` or pasted from a CLI workflow works as-is. Quote JSON
with single quotes so the inner double quotes survive parsing.

## Compiling in-place (--circom)

`--circom` compiles the given source (inline heredoc or URL) and runs an
in-place setup. `--system` picks the proof system:

- **groth16** (default): **DEV-ONLY** — the circuit-specific phase 2 has no
  ceremony, so anyone can reproduce it and forge proofs. Smallest proofs
  and cheapest verification, but never use an in-place groth16 setup
  beyond prototyping.
- **plonk** / **fflonk**: the setup is *deterministic* — there is no
  circuit-specific ceremony to fake. Its security reduces entirely to the
  powers-of-tau, so with a real one (the auto-downloaded Hermez files) the
  resulting verifier is production-grade. Verification costs more gas than
  groth16.

`--ptau` picks the powers-of-tau (`dev` = generate locally — dev-only for
every system, a URL, or omitted = auto-download a Hermez file sized to the
circuit). The compile and setup are cached per (source, ptau, system) for
the session and shared with
[@circom:verifier](../helpers/verifier.md), so the deployed
verifier always matches the proofs. `--circom` is mutually exclusive with
`--wasm`/`--zkey`; pre-built zkeys carry their proof system, which is
auto-detected.

## Artifact integrity

`--wasm`, `--zkey` and `--ptau` URLs accept an optional integrity pin:
`https://…/final.zkey#sha256=0x…`. The fragment is stripped before
fetching and the download must match the digest. `ipfs://` artifacts are
already hash-verified against their CID.

## Notes

- Only Groth16 proofs are supported.
- Artifacts are fetched once and cached for the session.
- Proving is CPU-heavy — expect seconds for small circuits and minutes for
  large ones. Proof bytes are randomized on every run; only the public
  signals are deterministic.
- The bound value is plain JSON (`{"proof": …, "publicSignals": […]}`),
  interchangeable with snarkjs CLI output.

## See Also

- [@circom:proof](../helpers/proof.md) — project the bound JSON into verifier-call arguments
- [@circom:verifier](../helpers/verifier.md) — deploy the matching verifier
