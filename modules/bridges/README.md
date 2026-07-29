# bridges module

Cross-chain bridging: send tokens to another chain over CCTP, Across, LayerZero, CCIP or the canonical bridge, with fees, transfer status and claims. Bridges auto-relay inside sim:fork, so a whole cross-chain script can be simulated end to end.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load bridges
```

## Commands

| Command | Description |
|---------|-------------|
| [bridges:bridge](src/commands/bridge.md) | Send tokens from the current chain to another chain, approving the bridge automatically when needed. The adapter defaults to CCTPv2 for native USDC, Across for other tokens, and the canonical bridge between an L2 and mainnet. |
| [bridges:claim](src/commands/claim.md) | Finalize a two-step bridge on the destination chain: mint a CCTP transfer once Circle has attested it, or prove and finalize a canonical L2 withdrawal. Run it after switching to the destination chain. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@bridges:fee](src/helpers/fee.md) | `number` | Cost of bridging an amount to another chain, in base units of the token (the amount the bridge keeps). Messaging fees that LayerZero and CCIP charge in the native token ride on the value of the bridge action and are not included here. |
| [@bridges:status](src/helpers/status.md) | `string` | Progress of a bridge transfer: pending, claimable, done, or unknown. Poll it with `loop until` to wait for a transfer to become claimable or arrive. |

