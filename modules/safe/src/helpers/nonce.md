---
title: "@safe:nonce"
---

Return the current on-chain nonce of a Safe. As @nonce! the nonce() read happens on-chain at assertion time — pin a proposal's execution window.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@safe:nonce(safe?)
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

## On-chain face (@nonce!)

Read the Safe's nonce() at assertion time — pin a proposal's execution
window on-chain.

### Examples

```evml
load assertions
load safe

set $safe 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @safe:nonce!($safe) == 42 "nonce moved"
```
