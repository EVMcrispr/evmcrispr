---
title: "@safe:threshold"
---

Signature threshold of a Safe.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@safe:threshold(safe?)
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

## On-chain face (@threshold!)

Read getThreshold() at assertion time. The Safe still resolves at
composition time (explicit argument, enclosing propose/exec block, or
the connected account).

### Examples

```evml
load assertions
load safe

set $safe 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @safe:threshold!($safe) >= 3 "threshold lowered"
```
