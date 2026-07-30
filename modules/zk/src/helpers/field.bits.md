---
title: "@zk:field.bits"
---

Decompose a value into its bits, least-significant first — e.g. a Merkle path index into the per-level indices a circuit expects.

**Returns**: `array`

## Syntax

```evml
@zk:field.bits(value count)
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
set [$index $siblings $len] @zk:tree.proof($leaves 1 pad:10)
print "Indices:" @zk:field.bits($index 10)
```

<!-- HAND-WRITTEN -->

## Notes

- Bits come out least-significant first, matching how circuits fold Merkle path indices (`Num2Bits` order).

## See Also

- [@zk:tree.proof](tree.proof.md) — the path index this typically decomposes
