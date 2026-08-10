---
title: "@ok!"
---

Whether a live call resolves without reverting: true when the call succeeds, false when it reverts.

**Returns**: `bool`

## Syntax

```evml
@ok!(call)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `address` | A `::` call expression (or chain, or on-chain helper) to probe |

<!-- HAND-WRITTEN -->

## Examples

```evml

set $token 0x6B175474E89094C44Da98b954EedeAC495271d0F

# True when the call resolves without reverting
assert @ok!($token::{symbol()(string)})

# Compose into boolean logic
assert @bool!(@ok!($token::{decimals()(uint8)}) and $token::{decimals()(uint8)} <= 18)
```

## Notes

- Compiles to the core's `ok(param)` primitive: 1 when the wrapped
  expression resolves, 0 when anything inside it reverts.
- The argument must be a live call (or on-chain helper) — a build-time
  constant cannot revert at assertion time, so passing one is an error.

## See Also

- [assert](../commands/assert.md), [@contracts:codeAt!](../../../contracts/src/helpers/codeAt.md)
