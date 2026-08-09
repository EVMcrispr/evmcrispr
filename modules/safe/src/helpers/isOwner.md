---
title: "@safe:isOwner"
---

Return whether an address is an owner of a Safe. As @isOwner! the Safe's own isOwner(address) view is read on-chain at assertion time.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@safe:isOwner(owner safe?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `owner` | `address` | Address to check |
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also

## On-chain face (@isOwner!)

Read the Safe's own isOwner(address) view at assertion time (the plain
face walks getOwners() off-chain instead).

### Examples

```evml
load assertions
load safe

set $safe 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @safe:isOwner!(@me $safe) "removed from owners"
```
