---
title: "@assertions:includes!"
---

Whether the string return of a call contains a substring, checked on-chain — exact byte sequence, case-sensitive, no wildcards.

**Returns**: `bool`

## Syntax

```evml
@assertions:includes!(call part)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `address` | A `::` call expression (or chain) returning a string |
| `part` | `string` | Non-empty byte sequence to search for |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $pool 0x44fA8E6f47987339850636F88629646662444217

# "Uniswap LP Token" contains "LP"
assertions:assert @includes!($pool::{name()(string)} "LP") == true

# The name must NOT mention a rebrand
assertions:assert @includes!($pool::{name()(string)} "Sushi") == false
```

## Notes

- Matches the exact byte sequence: case-sensitive, no wildcards or regex; a
  multi-byte UTF-8 `part` matches its exact encoding.
- An empty `part` is rejected at build time — every string contains it, so
  the assertion could never fail.
- Boolean-valued: usable bare, compared with `== true` / `== false`, or
  nested inside `@bool!(...)` logic.

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:charset!](charset-bang.md), [@assertions:split!](split-bang.md)
