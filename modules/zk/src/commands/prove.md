---
title: "zk:prove"
---

Generate a Groth16 proof with snarkjs from pre-built circom artifacts and bind the result (proof + public signals, as JSON) to <variable>. Read the verifier-call arguments back with @zk:proof.

## Syntax

```evml
zk:prove <variable>
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
| `--inputs` | `string` | Circuit input signals as a JSON object string |

<!-- HAND-WRITTEN -->

## Examples

```
load zk
zk:prove $proof --wasm ipfs://<wasm-cid> --zkey ipfs://<zkey-cid> --inputs '{"a":3,"b":11}'
set [$a $b $c $signals] @zk:proof($proof)
exec $verifier "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1])" $a $b $c $signals
```

Input values may be numbers, decimal strings, or nested arrays, matching the circuit's input signals by name. Quote the JSON with single quotes so the inner double quotes survive parsing.

## Notes

- Only Groth16 proofs are supported. The artifacts are the standard circom/snarkjs pair: the compiled witness generator (`circuit.wasm`) and the final proving key (`.zkey`) from a completed ceremony.
- Artifacts are fetched once and cached for the session, so several proves against the same circuit only download them once.
- Proving is CPU-heavy — expect seconds for small circuits and minutes for large ones. Proof bytes are randomized on every run; only the public signals are deterministic.
- The bound value is plain JSON (`{"proof": …, "publicSignals": […]}`), interchangeable with snarkjs CLI output — a proof generated elsewhere can be `set` into a variable and consumed with [@zk:proof](../helpers/proof.md) the same way.

## See Also

- [@zk:proof](../helpers/proof.md) — project the bound JSON into verifier-call arguments
