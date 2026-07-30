---
title: "@noir:verify"
---

Verify an UltraHonk proof off-chain against a verification key — no deployed verifier needed. The transcript (keccak or poseidon) is auto-detected from the proof JSON; the vkey must come from @noir:vkey with the matching oracle.

**Returns**: `bool`

## Syntax

```evml
@noir:verify(proof vkey)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proof` | `string` | Proof JSON string bound by noir:prove |
| `vkey` | `string` | Verification key as 0x-hex bytes (from @noir:vkey) |

<!-- HAND-WRITTEN -->

## Examples

```evml
set $src <<<NOIR
fn main(x: Field, y: pub Field) {
    assert(x != y);
}
NOIR
noir:prove $proof --noir $src --inputs [x:3 y:5]
print "Valid:" @noir:verify($proof @noir:vkey($src))
```

## Notes

No deployed contract is needed — verification runs locally through
Barretenberg. The proof JSON records which transcript it used, so a
keccak proof is checked against a keccak vkey and a poseidon proof
against a poseidon one; supply the vkey from `@noir:vkey` with the
matching `oracle:`.

## See Also

- [@noir:vkey](vkey.md) — produces the verification key
- [@noir:verifier](verifier.md) — on-chain verification instead
