---
title: "@contracts:slot.mapping"
---

Derive the storage slot of mapping[key] for a mapping declared at a base slot: keccak256(h(key) . base).

**Returns**: `bytes32`

## Syntax

```evml
@contracts:slot.mapping(base key)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `base` | `bytes32` | Declared slot of the mapping |
| `key` | `any` | Mapping key |

## Examples

```evml
# Slot of balanceOf[account] for a mapping at slot 3
set $slot @contracts:slot.mapping(3 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6)
```

<!-- HAND-WRITTEN -->

## On-chain face (@contracts:slot.mapping!)

The base slot must be a constant — it names a position in a declared
storage layout, which only exists in source. The key may be live: a word
value is ABI left-padded exactly as `encodeKey` pads value types (signed
words are already two's-complement), and a string/bytes value hashes its
raw payload, so the slot is one keccak over one concatenation either way.

The computed slot is only readable on-chain through a contract that
exposes an `extsload`-style getter (Uniswap v4 style) reached with `::` —
there is no opcode for reading another contract's storage, which is the
same reason `@contracts:storageAt` has no on-chain face at all.

## See Also
