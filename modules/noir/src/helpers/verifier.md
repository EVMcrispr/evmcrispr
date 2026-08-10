---
title: "@noir:verifier"
---

Compile Noir source and return the Solidity UltraHonk verifier contract source (always the keccak/EVM transcript), ready to pipe through @contracts:solidity and contracts:deploy, then call verify(bytes,bytes32[])(bool) with the tuple from @noir:proof. Shares the compile cache with noir:prove --noir, so deployed verifier and generated proofs always match.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@noir:verifier(source)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | Noir source code, or a http(s)/ipfs URL to fetch it from |

<!-- HAND-WRITTEN -->

## Deploying

The generated `HonkVerifier` (pragma `>=0.8.21`) keeps its transcript and
relations code in two external libraries — `ZKTranscriptLib` and
`RelationsLib` — to stay under the contract size limit, so deployment is
three steps: deploy both libraries, then link them via the `libraries:`
option of `@contracts:solidity`:

```evml
load contracts

set $src <<<NOIR
fn main(x: Field, y: pub Field) {
    assert(x != y);
}
NOIR
set $vsrc @noir:verifier($src)

contracts:deploy $translib @contracts:solidity($vsrc contract:ZKTranscriptLib version:0.8.28)
contracts:deploy $rellib @contracts:solidity($vsrc contract:RelationsLib version:0.8.28)
contracts:deploy $verifier @contracts:solidity($vsrc contract:HonkVerifier version:0.8.28 libraries:[[ZKTranscriptLib $translib] [RelationsLib $rellib]])

noir:prove $proof --noir $src --inputs [x:3 y:5]
set [$p $signals] @noir:proof($proof)
exec $verifier "verify(bytes,bytes32[])(bool)" $p $signals
```

The verifier always uses the keccak transcript (the default of
`noir:prove` and `@noir:vkey`) — poseidon-oracle proofs will not verify
on-chain. Unlike groth16, UltraHonk needs no circuit-specific trusted
setup: the verifier embeds a deterministic verification key, so the same
source always produces the same contract.

## See Also

- [noir:prove](../commands/prove.md) — generate the proofs this verifier accepts
- [@noir:proof](proof.md) — the `verify(bytes,bytes32[])` argument tuple
