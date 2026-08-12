---
title: "@contracts:slot.array"
---

Derive the storage slot of element index of a dynamic array declared at a base slot: keccak256(base) + index.

**Returns**: `bytes32`

## Syntax

```evml
@contracts:slot.array(base index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `base` | `bytes32` | Declared slot of the array |
| `index` | `number` | Element index |

## Examples

```evml
# Slot of the first element of a dynamic array at slot 2
set $slot @contracts:slot.array(2 0)
```

<!-- HAND-WRITTEN -->

## On-chain face (@contracts:slot.array!)

The base slot must be a constant — it names a position in a declared
storage layout — so `keccak256(base)` folds at composition and a live
index (a `length()` read, a counter) costs exactly one addition. The
plain face wraps modulo 2^256 where the on-chain addition is checked;
no real index reaches that edge.

As with `@contracts:slot.mapping!`, the computed slot is only readable
on-chain through an `extsload`-style getter on the target — there is no
opcode for foreign storage, which is why `@contracts:storageAt` stays
off-chain.

## See Also
