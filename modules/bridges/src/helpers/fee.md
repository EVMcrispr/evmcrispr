---
title: "@bridges:fee"
---

Cost of bridging an amount to another chain, in base units of the token (the amount the bridge keeps). Messaging fees that LayerZero and CCIP charge in the native token ride on the value of the bridge action and are not included here.

**Returns**: `number`

## Syntax

```evml
@bridges:fee(amount token destChain adapter?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount to bridge, in base units (wei) |
| `token` | `address` | Token to bridge |
| `destChain` | `chain` | Destination chain name or id |
| `[adapter]` | `bridge-adapter` | Adapter to quote (default: the best adapter for the token and lane) |

## Examples

```evml
# Check what bridging 1000 DAI to Optimism costs
load bridges

switch mainnet
print @bridges:fee(1000e18 0x6B175474E89094C44Da98b954EedeAC495271d0F optimism)

# Bridge only when the relayer fee is under 5 DAI
load bridges

switch mainnet
if @bool(@bridges:fee(1000e18 0x6B175474E89094C44Da98b954EedeAC495271d0F optimism) < 5e18) (
  bridges:bridge 1000e18 0x6B175474E89094C44Da98b954EedeAC495271d0F optimism
)
```

<!-- HAND-WRITTEN -->

## See Also

- [bridges:bridge](../commands/bridge.md)
- [@bridges:status](./status.md)
