---
title: "@zk:poseidon"
---

Hash 1-16 field elements with the circomlib Poseidon permutation over the BN254 scalar field (the hash used by Semaphore, Tornado and most circom circuits).

**Returns**: `number`

## Syntax

```evml
@zk:poseidon(...inputs)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...inputs]` | `number` | 1-16 field elements to hash (numbers, decimal strings or hex values) |

## Examples

```evml
# Hash two values with Poseidon (e.g. a commitment to a secret and a nullifier)
set $commitment @zk:poseidon(1234 5678)
print "Commitment:" $commitment
```

<!-- HAND-WRITTEN -->

## Notes

- Uses the circomlib Poseidon parameters over the BN254 scalar field — outputs match `circomlib/poseidon.circom`, Semaphore and Tornado circuits.
- Inputs are reduced into the field first ([@zk:field](field.md) semantics), so hex values and negative numbers are accepted.
- Arity is part of the permutation: `@zk:poseidon(1)` and `@zk:poseidon(1 0)` are different hashes.

## See Also

- [@zk:field](field.md) — the input reduction applied to every argument
- [@zk:tree.root](tree.root.md) — Poseidon Merkle trees over field elements
