---
title: "@assertions:bytes!"
---

Bitwise word operations computed on-chain (`&` `|` `^` `<<` `>>`), or with a single argument the raw 32-byte word cast (e.g. bool as 0/1). Word-width semantics: operands are the raw 32-byte words; shifts are in bits.

**Returns**: `number`

## Syntax

```evml
@assertions:bytes!(a op? b?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `a` | `any` | Left operand, or the sole value to cast to its raw word |
| `[op]` | `string` | Bitwise operator: `&` `|` `^` `<<` `>>` |
| `[b]` | `any` | Right operand (shift amount in bits for `<<`/`>>`) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $token 0x0102030405060708090a0b0c0d0e0f1011121314

# Mask a packed config word and compare the extracted flags
assertions:assert @bytes!($token::{config()(bytes32)} "&" 0xff) == 3 "unexpected flags"

# Shift a packed word right by 160 bits to drop the address part
assertions:assert @bytes!($token::{slot0()(bytes32)} ">>" 160) > 0 "empty upper bits"

# Single argument: the raw 32-byte word cast — a bool becomes 0/1
assertions:assert @bytes!($token::{paused()(bool)}) == 0 "token is paused"
```

## Notes

- Operands are the raw 32-byte words the calls return (or constants); operations are word-width, exactly as the EVM `AND`/`OR`/`XOR`/`SHL`/`SHR` opcodes compute them.
- Shift amounts are in bits; shifting by 256 or more yields 0.
- Unlike the off-chain `@bytes`, there is no `utf8` mode — string returns have no single word to operate on.

## See Also

- [@assertions:not!](not-bang.md) for the bitwise complement
- a destructure lens (`[_ $ _]`, `[... $]`, `[[... $]]`) to pick one value out of longer return data
