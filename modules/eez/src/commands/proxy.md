---
title: "eez:proxy"
---

Create the cross-chain proxy on the current chain for a contract on another EEZ rollup. Does nothing if it already exists.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
eez:proxy <target>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | Contract address on the other rollup |

## Examples

```evml
# Create the L1 proxy for a rollup contract, so L1 code can call it
switch eezL1
eez:proxy 0x000000000000000000000000000000000000dEaD
```

<!-- HAND-WRITTEN -->

## See Also
