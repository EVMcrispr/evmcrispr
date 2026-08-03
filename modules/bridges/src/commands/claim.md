---
title: "bridges:claim"
---

Finalize a two-step bridge on the destination chain: mint a CCTP transfer once Circle has attested it, or prove and finalize a canonical L2 withdrawal. Run it after switching to the destination chain.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
bridges:claim <transferId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `transferId` | `string` | Transaction hash of the bridge on the source chain |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--using` | `bridge-adapter` | Adapter that initiated the transfer (default: detected from the source transaction) |
| `--from-chain` | `chain` | Source chain of the transfer (default: probed across supported chains) |

<!-- HAND-WRITTEN -->

## Examples

Bridges are asynchronous, so a claim happens in a later script than the bridge. The transfer id is the **source-chain transaction hash** of the bridge:

```evml
load bridges

switch base
bridges:claim 0x1111111111111111111111111111111111111111111111111111111111111111 --from-chain mainnet
```

Wait for the attestation, then claim, in one long-running script:

```evml
load bridges
load std

set $transferId 0x1111111111111111111111111111111111111111111111111111111111111111
loop until @bool(@bridges:status($transferId) == "claimable") (
  wait 30s
)
switch base
bridges:claim $transferId
```

## What a claim does

| Adapter | Claim |
|---------|-------|
| `CCTPv2` | Fetches Circle's attestation and calls `receiveMessage` on the destination MessageTransmitter |
| `NativeBridge` (OP Stack) | Proves the withdrawal, then finalizes it after the 7-day challenge window (run `claim` twice) |
| `NativeBridge` (Arbitrum) | Builds the outbox merkle proof and executes the withdrawal on the L1 Outbox |
| `Across` / `LayerZero` / `CCIP` | Nothing to claim — relayers, executors and the DON deliver these |

Claiming too early fails with the reason (attestation pending, output root not published, still inside the challenge window). Poll `@bridges:status` until it reports `claimable`.

Inside a `sim:fork`, claims are unnecessary: the simulation auto-relays the destination leg when you switch chains.

## See Also

- [bridges:bridge](./bridge.md)
- [@bridges:status](../helpers/status.md)
