---
title: "@assertions:not!"
---

Negation computed on-chain, dispatched on the operand: logical not for booleans (stays a bool), bitwise complement of the raw 32-byte word for numbers and bytes32. Never a conversion — cast explicitly with @bytes!(x) first if needed.

**Returns**: `any`

## Syntax

```evml
@assertions:not!(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `any` | Boolean (logical not) or number/bytes32 (bitwise not) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $vault 0x0102030405060708090a0b0c0d0e0f1011121314

# Logical not on a live bool — stays a bool
assertions:assert @not!($vault::{paused()(bool)}) "vault is paused"

# Bitwise complement of a mask word
assertions:assert @bytes!($vault::{flags()(bytes32)} "&" @not!(0xff)) == 0 "bits set outside the low byte"
```

## Notes

- Dispatches on the operand: booleans get logical not (`unary(IsZero)`, result stays a bool); numbers and `bytes32` get the bitwise complement of their raw 32-byte word (EVM `NOT`).
- It never converts between bool and number — bridge explicitly with `@bytes!(x)` (bool → 0/1 word) or a comparison (`x != 0`, number → bool).

## See Also

- [@assertions:bytes!](bytes-bang.md) for binary bitwise operations and the raw word cast
