---
title: "eez:deploy-proxy"
---

Create the cross-chain proxy on the current chain for a contract on another EEZ rollup. Does nothing if it already exists.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. The destination chain and proxy address are derived at build time.

## Syntax

```evml
eez:deploy-proxy <target>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `target` | `address` | Build time | Contract address on the other rollup |

## Examples

```evml
# Create the L1 proxy for a rollup contract, so L1 code can call it
switch gnosisChiado
eez:deploy-proxy 0x000000000000000000000000000000000000dEaD
```

<!-- HAND-WRITTEN -->

## See Also
