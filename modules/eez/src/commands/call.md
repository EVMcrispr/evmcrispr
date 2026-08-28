---
title: "eez:call"
---

Call a contract on another EEZ rollup synchronously from the current chain, through its cross-chain proxy: the call executes on the other side atomically with this transaction. Creates the proxy first if it does not exist yet, and submits the call through the EEZ cross-chain ingress.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
eez:call <target> <signature> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | Contract address on the other rollup |
| `signature` | `write-abi` | Function signature (e.g. `"setValue(uint256)"`) |
| `[...params]` | `any` | Arguments matching the signature types |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--rollup` | `number` | Rollup id the target lives on. Defaults to the other side of the current chain. |
| `--value` | `number` | ETH to send with the call (in wei) |
| `--gas` | `number` | Gas limit. By default the remote leg is simulated on the other chain and the protocol overhead added; set this if the call still runs out of gas or is evicted. |
| `--from` | `address` | Sender address (requires simulation or connected wallet) |

## Examples

```evml
# From L1, set a value on a rollup contract in one atomic transaction
eez:call 0x000000000000000000000000000000000000bEEF setValue(uint256) 42
```

<!-- HAND-WRITTEN -->

## How it works

An EEZ rollup and its L1 share one sequencer, so a call can cross between them inside a single transaction. On the sending chain every remote contract has a deterministic *cross-chain proxy*; calling the proxy with ordinary calldata runs the call on the other side, and the return value (or revert) comes back in the same transaction. `eez:call` resolves that proxy for `target` (creating it with a preceding transaction if nobody has yet), encodes the call exactly like `exec`, and marks the transaction to be submitted through the chain's **cross-chain ingress** rather than its execution RPC — the ingress holds it, simulates both sides and includes it in the next sync block.

- With a local signing key (CLI, scripts) the routing is automatic.
- With a browser wallet the transaction leaves through the wallet's own RPC, so the wallet's network entry for the sending chain must point at the ingress URL (`$eez:front`); the run logs a reminder.
- A receipt on the sending chain means the cross-chain effect was applied atomically; the rollup's state reflects it a few seconds later.
- Gas is estimated by simulating the remote leg on the other chain and adding the protocol overhead (the sending chain itself cannot estimate a cross-chain call). Pass `--gas` if the call still runs out of gas or is evicted.

`--rollup` defaults to the other side of the current chain (the rollup from L1, L1 from the rollup); pass it when the target lives on a different rollup.

## See Also

- [eez:proxy](proxy.md) — create the proxy explicitly
- [@eez:proxy](../helpers/proxy.md) — resolve the proxy address without calling
