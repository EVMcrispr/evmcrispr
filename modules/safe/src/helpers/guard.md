---
title: "@safe:guard"
---

Return the transaction guard address of a Safe (the zero address when no guard is set). As @guard! the guard slot is read on-chain at assertion time through the Safe's own getStorageAt view.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@safe:guard(safe?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also

## On-chain face (@guard!)

Read the guard slot at assertion time through the Safe's own
getStorageAt(slot, 1) view — the slot value's word is unwrapped from
the returned bytes envelope with a core pick, so no raw
eth_getStorageAt is needed.

### Examples

```evml
load assertions
load safe

set $safe 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @safe:guard!($safe) == 0x0000000000000000000000000000000000000000 "guard installed"
```
