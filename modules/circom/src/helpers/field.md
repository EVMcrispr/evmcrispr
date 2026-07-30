---
title: "@circom:field"
---

Reduce a value into the BN254 scalar field: values >= the field prime wrap around and negative values wrap to p - |x| (the circom convention).

**Returns**: `number`

## Syntax

```evml
@circom:field(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `any` | Number, decimal string, or hex/bytes32 value to reduce into the field |

## Examples

```evml
# Fit a keccak256 hash into the BN254 field before using it as a circuit input
set $leaf @circom:field(@hash("my secret"))
print "Leaf:" $leaf
```

<!-- HAND-WRITTEN -->

## Notes

- Reduction follows the circom convention: values wrap modulo the prime `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`, and negatives map to `p - |x|`.
- Every circom helper applies this reduction to its inputs implicitly; use `@circom:field` when you need the reduced value itself (e.g. to compare against a public signal).

## See Also

- [@circom:field.hash](field.hash.md) — keccak256-then-reduce for arbitrary bytes
- [@circom:poseidon](poseidon.md) — hash field elements
