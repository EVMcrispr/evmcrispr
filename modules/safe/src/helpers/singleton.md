---
title: "@safe:singleton"
---

Singleton (implementation) address a Safe proxy delegates every call to, read from its storage slot 0.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@safe:singleton(safe?)
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
print @safe:singleton($mySafe)
```

## On-chain face (@singleton!)

Read slot 0 at assertion time through the Safe's own getStorageAt(0, 1)
view. A delegatecall runs on the Safe's storage and can point the proxy at
other code without emitting anything, so an assertion that the singleton
is unchanged is the one to keep beside a `safe:delegate-exec`.

The Safe may also be a `::!` call that returns its address, such as
`@safe:singleton!($registry::!{safe()(address)})`: the read is then made
against whatever address that call returns when the assertion runs.

### Examples

```evml
load safe

set $safe 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assert @safe:singleton!($safe) == @safe:singleton($safe) "singleton changed"
```

## See Also

- [@safe:fallbackHandler](./fallbackHandler.md)
- [safe:delegate-exec](../commands/delegate-exec.md)
- [safe:upgrade](../commands/upgrade.md)
