---
title: "@zk:field.hash"
---

Hash hex bytes with keccak256 and reduce the digest into the BN254 scalar field — the standard way to map addresses, strings or arbitrary data into a circuit input.

**Returns**: `number`

## Syntax

```evml
@zk:field.hash(data)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `data` | `bytes` | Hex bytes to hash (compose multiple values with @abi.encodePacked) |

## Examples

```evml
# Map an address into a field element (e.g. as a tree leaf)
print "Leaf:" @zk:field.hash(@me)
```

<!-- HAND-WRITTEN -->

## Notes

- Computes `keccak256(data) mod p`. This is the common way to map addresses, strings and other non-field data into circuit inputs, but note that many protocols define their own mapping — check the circuit before assuming this one.
- The result is uniform enough for commitments but is NOT the Poseidon hash; use [@zk:poseidon](poseidon.md) when the circuit hashes with Poseidon.

## See Also

- [@zk:field](field.md) — reduction without hashing
- [@zk:poseidon](poseidon.md) — the in-circuit hash
