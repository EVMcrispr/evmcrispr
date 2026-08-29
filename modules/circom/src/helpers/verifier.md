---
title: "@circom:verifier"
---

Compile circom source (inline text or a http/ipfs URL), run an in-place setup, and return the Solidity verifier source with the verification key embedded, ready to pipe into @contracts:solidity to deploy. groth16 setups are DEV-ONLY (no ceremony); plonk/fflonk setups are deterministic and production-grade given a real powers-of-tau.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@circom:verifier(source ptau:<value> system:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | circom source code, or a http(s)/ipfs URL to fetch it from |
| `ptau:` | `string` | Powers-of-tau: `ptau:dev` or `ptau:<url>` (default: auto-download a hez file sized to the circuit) |
| `system:` | `string` | Proof system: `system:groth16|plonk|fflonk` (default groth16) |

<!-- HAND-WRITTEN -->

## Trusted setup

- **groth16** (default) setups are generated on the spot with no
  multi-party ceremony: **anyone who reproduces the setup can forge proofs
  that the verifier accepts**. Prototyping only.
- **`system:plonk`** / **`system:fflonk`** setups are *deterministic* — no
  circuit-specific ceremony exists, and security reduces to the
  powers-of-tau alone. With a real ptau (the auto-downloaded Hermez
  ceremony files) the exported verifier is production-grade, at a higher
  verification gas cost than groth16. With `ptau:dev` any system is
  dev-only, since a local ptau is itself unceremonied.

## Powers of tau

| Option | Effect |
|--------|--------|
| *(none)* | Auto-download `powersOfTau28_hez_final_<p>.ptau` from the public Hermez ceremony, with `2^p` sized to the circuit (min `2^8`, cap `2^16`) |
| `ptau:dev` | Generate a local powers-of-tau (fast for small circuits; cap `2^12`) |
| `ptau:<url>` | Fetch a specific ptau file (http(s) or ipfs) |

Setups are cached per (circuit, ptau option) for the session, and
[circom:prove --circom](../commands/prove.md) resolves through the same cache —
so the verifier you deploy and the proofs you generate in one script always
match.

## Examples

```evml
load circom
load contracts

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

contracts:deploy $verifier @contracts:solidity(@circom:verifier($src ptau:dev))
circom:prove $proof --circom $src --ptau dev --inputs [[a 3] [b 11]]
set [$a $b $c $signals] @circom:proof($proof)
print "Valid:" @get($verifier "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1])(bool)" $a $b $c $signals)
```

## Includes

`include` statements are prefetched before compiling: absolute URLs as
written, version-pinned npm paths (e.g.
`circomlib@2.0.5/circuits/poseidon.circom`) from npm-registry tarballs
verified against their published integrity hash, and relative includes
when the including file lives at a URL. Unpinned npm paths throw (mutable
content has no stable hash to verify), as do relative includes in inline
source. The circom compiler wasm itself is verified against a repo-pinned
hash before it runs.

## See Also

- [circom:prove](../commands/prove.md) — prove with `--circom` against the same cached setup
- [@circom:constraints](constraints.md) — size the ptau a circuit needs
