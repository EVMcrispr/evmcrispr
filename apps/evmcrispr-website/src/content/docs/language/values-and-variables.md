---
title: Values & Variables
---

## Variables

Use `set` to assign values and `$name` to reference them:

```evml
load token

set $recipient 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
set $amount @token:amount(DAI 1000)
exec @token(DAI) "transfer(address,uint256)" $recipient $amount
```

## Types

The language supports these value types:

| Type | Example | Description |
|------|---------|-------------|
| `address` | `0xAbCd...1234` | 20-byte Ethereum address |
| `number` | `42`, `100e18`, `1.5e6` | Integer or scientific notation |
| `string` | `"hello"`, `'it\'s fine'` | Quoted string (single or double); supports `\'`, `\"`, `\\`, `\n`, `\r`, `\t`, and `\u{HHHH}` escapes (any other `\X` is left literal); may span multiple lines |
| `bool` | `true`, `false` | Boolean |
| `bytes` | `0xdeadbeef` | Hex-encoded bytes |
| `bytes32` | `0x00...001` | 32-byte value |
| `array` | `[1 2 3]` | Ordered collection — elements are space-separated, never commas |

Numbers support scientific notation with `e`: `100e18` means `100 * 10^18`.
This is useful for token amounts with 18 decimals.

## Arithmetic & Boolean Expressions

Use `@num()` for arithmetic and `@bool()` for boolean logic:

```evml
set $a 1
set $b 2
set $total @num($a + $b * 2)

set $x 5
set $y 50
set $isValid @bool($x > 0 and $y < 100)
```

## Next Steps

- [Control Flow](control-flow.md) — use expressions to drive `if` and `loop`
- [Syntax](syntax.md) — commands, helpers, and options
