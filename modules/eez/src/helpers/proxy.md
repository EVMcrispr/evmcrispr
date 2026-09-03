---
title: "@eez:proxy"
---

Address on the current chain of the cross-chain proxy standing in for a contract on another EEZ chain. Deterministic, so it resolves whether or not the proxy has been created yet.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@eez:proxy(chain target)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `chain` | `chain` | Chain the target lives on (`eezL1`, `eezL2`) |
| `target` | `address` | Contract address on that chain |

## Examples

```evml
# Resolve where a rollup contract is reachable from L1, e.g. to pass it to another contract
switch eezL1
print @eez:proxy(eezL2 0x000000000000000000000000000000000000dEaD)
```

<!-- HAND-WRITTEN -->

## Notes

- The address is deterministic (CREATE2 from the target and its rollup id on the current chain's EEZ registry), so it can be used before the proxy exists — for instance as a constructor argument. Calling through it only works once it has been created: [eez:proxy](../commands/proxy.md) creates it explicitly and [eez:on](../commands/on.md) creates it on demand.
- Which chain you are on matters: the same target has a different face on each chain. The first argument names the chain the target lives on (`eezL1`, `eezL2`, or a chain id); a bare rollup id works for rollups this module has no chain entry for.

## On-chain face (@eez:proxy!)

The registry's `computeCrossChainProxyAddress(target, rollupId)` read at assertion time. The chain resolves to a rollup id when the script is composed; the target may be live (a `::` call or another on-chain helper), so `@eez:proxy!(eezL2 @eez:target!(eezL1 $proxy))` round-trips through both registries inside one assertion.

```evml
switch eezL1
assert @eez:proxy!(eezL2 0x000000000000000000000000000000000000dEaD) == @eez:proxy(eezL2 0x000000000000000000000000000000000000dEaD)
```

## See Also

- [eez:proxy](../commands/proxy.md) — create the proxy
- [eez:on](../commands/on.md) — call the target through it
- [@eez:target](target.md) — the reverse lookup
