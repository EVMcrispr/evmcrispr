---
title: "@safe:guard"
---

Transaction guard address of a Safe, or with module:true its module guard (the zero address when none is set; module guards need Safe v1.5.0 or later, so it is always zero on older Safes).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@safe:guard(safe? module:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |
| `module:` | `bool` | `module:true` — read the module guard instead |

<!-- HAND-WRITTEN -->

## Examples

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
print @safe:guard($mySafe)
print @safe:guard($mySafe module:true)
```

## See Also

- [safe:set-guard](../commands/set-guard.md)
- [safe:remove-guard](../commands/remove-guard.md)

## On-chain face (@guard!)

Read the guard slot at assertion time through the Safe's own
getStorageAt(slot, 1) view — the slot value's word is unwrapped from
the returned bytes envelope with a core pick, so no raw
eth_getStorageAt is needed. `module:true` reads the module guard slot
instead; the choice is fixed when the script is built. On a Safe below
v1.5.0 the module guard slot is always empty, so the assertion reads the
zero address there.

### Examples

```evml
load safe

set $safe 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assert @safe:guard!($safe) == 0x0000000000000000000000000000000000000000 "guard installed"
assert @safe:guard!($safe module:true) == 0x0000000000000000000000000000000000000000 "module guard installed"
```
