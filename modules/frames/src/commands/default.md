---
title: "frames:default"
---

Make every call of the block a DEFAULT frame of a frame transaction: called by the entry point, not by the sender. Only works inside `frames:tx`.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. A frame transaction is its own transaction; it cannot run inside a smart batch.

## Syntax

```evml
frames:default <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `block` | `block` | Build time | Commands whose calls become DEFAULT frames |

<!-- HAND-WRITTEN -->

## How it works

Every call in the block becomes a DEFAULT frame of the enclosing [frames:tx](tx.md): it is called by the entry point instead of by the sender. A default frame right before a verify with the same target is that verify's pre-verify. `default` and `batch` compose both ways.

```evml
load frames [tx verify default]

tx (
  verify @me --approve execution
  default (
    exec 0x0000000000000000000000000000000000000002 "pullFee(address,uint256)" @me 1000000
  )
  verify 0x0000000000000000000000000000000000000002 "verify()" --approve payment
  exec 0x0000000000000000000000000000000000000001 "f()"
)
```
