---
title: "@circom:field.bits"
---

Decompose a value into its bits, least-significant first — e.g. a Merkle path index into the per-level indices a circuit expects.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@circom:field.bits(value count)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `number` | Value to decompose (must fit in count bits) |
| `count` | `number` | Number of bits to produce (1-254) |

## Examples

```evml
# Turn a Merkle path index into the per-level indices a circuit expects
set $leaves [1234 5678 9012]
set [$index $siblings $len] @circom:tree.proof($leaves 1 pad:10)
print "Indices:" @circom:field.bits($index 10)
```

<!-- HAND-WRITTEN -->

## Notes

- Bits come out least-significant first, matching how circuits fold Merkle path indices (`Num2Bits` order).

## See Also

- [@circom:tree.proof](tree.proof.md) — the path index this typically decomposes
