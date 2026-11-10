---
title: "@safe:fallbackHandler"
---

Fallback handler address of a Safe, which answers the calls the Safe itself does not implement (the zero address when none is set).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@safe:fallbackHandler(safe?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
print @safe:fallbackHandler($mySafe)
```

## On-chain face (@fallbackHandler!)

Read the fallback handler slot at assertion time through the Safe's own
getStorageAt(slot, 1) view. The handler answers every call the Safe does
not implement, including `isValidSignature`, so a delegatecall that
replaced it would change what the Safe signs for.

The Safe may also be a `::!` call that returns its address, such as
`@safe:fallbackHandler!($registry::!{safe()(address)})`: the read is then
made against whatever address that call returns when the assertion runs.

### Examples

```evml
load safe

set $safe 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assert @safe:fallbackHandler!($safe) == @safe:fallbackHandler($safe) "fallback handler changed"
```

## See Also

- [@safe:singleton](./singleton.md)
- [safe:set-fallback-handler](../commands/set-fallback-handler.md)
- [safe:delegate-exec](../commands/delegate-exec.md)
