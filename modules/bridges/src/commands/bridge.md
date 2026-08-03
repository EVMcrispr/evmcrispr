---
title: "bridges:bridge"
---

Send tokens from the current chain to another chain, approving the bridge automatically when needed. The adapter defaults to CCTPv2 for native USDC, Across for other tokens, and the canonical bridge between an L2 and mainnet.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
bridges:bridge <amount> <token> <to> <destChain>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount to bridge, in base units (wei) |
| `token` | `address` | Token to bridge (use @token(SYM); the native token resolves to the zero address) |
| `to` | `command` | Keyword `to` |
| `destChain` | `chain` | Destination chain name or id (e.g. optimism, base, 8453) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--receiver` | `address` | Recipient on the destination chain (defaults to the connected account) |
| `--using` | `bridge-adapter` | Adapter: CCTPv2, Across, NativeBridge, LayerZero or CCIP (default: the best adapter for the token and lane) |
| `--max-fee` | `number` | Abort when the bridge fee, in base units of <token>, exceeds this bound |
| `--remote-token` | `address` | Destination-chain address of <token> (NativeBridge ERC-20 transfers only) |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Bridge 100 USDC from Ethereum to Base over CCTP
load bridges

switch mainnet
bridges:bridge 100e6 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 to base --using CCTPv2

# Bridge 1000 DAI to Optimism, paying out to someone else
load bridges

switch mainnet
bridges:bridge 1000e18 0x6B175474E89094C44Da98b954EedeAC495271d0F to optimism --receiver 0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9

# Move 1 ETH to Optimism through the canonical bridge
load bridges

switch mainnet
bridges:bridge 1e18 0x0000000000000000000000000000000000000000 to optimism --using NativeBridge
```

<!-- HAND-WRITTEN -->

## Adapters

| Adapter | Carries | Destination leg |
|---------|---------|-----------------|
| `CCTPv2` | Native USDC (burn/mint, no liquidity risk) | Two-step: `bridges:claim` once Circle attests |
| `Across` | ERC-20s across L2s and mainnet, fast | Filled by a relayer, nothing to claim |
| `NativeBridge` | The canonical OP Stack / Arbitrum bridges | Deposits arrive automatically; withdrawals take ~7 days and need `bridges:claim` |
| `LayerZero` | Tokens with an OFT or OFT adapter (pass the OFT as `<token>`) | Delivered by an executor |
| `CCIP` | Tokens with a Chainlink CCIP pool | Executed by the DON |

`LayerZero` and `CCIP` are never chosen implicitly — whether a given token is an OFT or has a CCIP pool is only knowable at runtime — so request them with `--using`.

## Tracking a transfer

Bridges are asynchronous, and the transfer id is the **source-chain transaction hash**. Once the bridge transaction has executed, poll it and finalize two-step bridges on the destination chain:

```evml
load bridges
load std

set $transferId 0x1234567890123456789012345678901234567890123456789012345678901234
print @bridges:status($transferId)
```

## Simulating a cross-chain script

Inside `sim:fork`, `switch` moves between per-chain forks and bridge transfers are **auto-relayed**: when the script switches to the destination chain, the simulation executes the destination leg (a mocked Circle attestation for CCTP, an impersonated relayer fill for Across, and so on). No `claim` is needed — and the whole round trip is verifiable with `sim:expect`:

```evml
load bridges
load sim

sim:fork --using anvil (
  bridges:bridge 100e6 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 to base --using CCTPv2
  switch base
  set $balance @get(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 "balanceOf(address)(uint256)" @me)
  sim:expect @bool($balance > 0)
)
```

A transfer whose destination chain the script never switches to is reported at the end of the fork, so a forgotten `switch` doesn't pass silently.

## See Also

- [bridges:claim](./claim.md)
- [@bridges:fee](../helpers/fee.md)
- [@bridges:status](../helpers/status.md)
