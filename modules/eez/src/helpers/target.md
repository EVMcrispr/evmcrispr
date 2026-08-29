---
title: "@eez:target"
---

The remote contract a cross-chain proxy stands in for: the reverse of @eez:proxy. Fails if the address is not a registered proxy on that chain.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@eez:target(chain proxy)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `chain` | `chain` | Chain the proxy lives on (`eezL1`, `eezL2`) |
| `proxy` | `address` | Cross-chain proxy address on that chain |

## Examples

```evml
# Which rollup contract does this L1 proxy stand in for?
switch eezL1
print @eez:target(eezL1 0x5e8DEb196c29ca9D828A7120f527482AEA3750F3)
```

<!-- HAND-WRITTEN -->

## See Also
