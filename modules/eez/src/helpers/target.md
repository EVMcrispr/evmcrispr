---
title: "@eez:target"
---

The remote contract a cross-chain proxy stands in for: the reverse of @eez:proxy. Fails if the address is not a registered proxy on that chain.

**On-chain (`@eez:target!`)**: Reads the registry of the chain the assertion runs on only, and an address that is not a proxy resolves to the zero address instead of failing.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@eez:target(chain proxy)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `chain` | `chain` | Chain the proxy lives on (`gnosisChiado`, `eezL2`) |
| `proxy` | `address` | Cross-chain proxy address on that chain |

## Examples

```evml
# Which rollup contract does this L1 proxy stand in for?
switch gnosisChiado
print @eez:target(gnosisChiado 0x8837aEedFaBbDA31c8676E6f46Eb5ABF54563230)
```

<!-- HAND-WRITTEN -->

## On-chain face (@eez:target!)

`authorizedProxies(proxy)` on the registry, keeping the original address (word 1 of the triple). Two differences from the off-chain face:

- An assertion runs on one chain, so only that chain's registry can be read: `@eez:target!(eezL2 …)` from L1 refuses at composition time.
- The registry answers a non-proxy with zeroes, so an address that is not a proxy resolves to the zero address instead of failing. `assert @eez:target!(gnosisChiado $x) == $expected` still fails for it; forcing a revert would take a contrived `cond` onto a failing param.

## See Also
