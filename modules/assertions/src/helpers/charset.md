---
title: "@assertions:charset!"
---

Whether every byte of the string return of a call is in a character class, checked on-chain — only-lowercase is @charset!(call `a-z`).

**Returns**: `bool`

## Syntax

```evml
@assertions:charset!(call class)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `any` | A `::` call expression (or chain) returning a string |
| `class` | `string` | Allowed characters and ranges, e.g. `a-z0-9-` (a leading or trailing dash is the literal `-`) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $token 0x44fA8E6f47987339850636F88629646662444217

# The symbol contains only lowercase letters
assertions:assert @charset!($token::{symbol()(string)} "a-z") == true

# An ENS-label-ish name: lowercase, digits and dashes
assertions:assert @charset!($token::{name()(string)} "a-z0-9-") == true
```

## Notes

- The class is characters and `x-y` ranges; a leading or trailing dash is
  the literal `-`. It compiles to a 256-bit byte bitmap at build time — the
  on-chain check is one bit test per byte.
- Byte-level: multi-byte UTF-8 characters (every byte ≥ 0x80) fail any
  ASCII-only class, so `a-z` really means lowercase ASCII.
- The empty string passes every class — pair with
  `@len!(call) > 0` when the value must also be non-empty.
- Boolean-valued: usable bare, compared with `== true` / `== false`, or
  nested inside `@bool!(...)` logic.

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:includes!](includes.md), [@assertions:len!](len.md)
