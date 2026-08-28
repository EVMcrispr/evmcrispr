---
title: "@eez:proxy"
---

Address on the current chain of the cross-chain proxy standing in for a contract on another EEZ rollup. Deterministic, so it resolves whether or not the proxy has been created yet.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@eez:proxy(target rollup:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | Contract address on the other rollup |
| `rollup:` | `number` | Rollup id the target lives on (`rollup:1`). Defaults to the other side of the current chain: the rollup from L1, L1 from the rollup. |

## Examples

```evml
# Resolve where a rollup contract is reachable from L1, e.g. to pass it to another contract
print @eez:proxy(0x000000000000000000000000000000000000dEaD)
```

<!-- HAND-WRITTEN -->

## See Also
