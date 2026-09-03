---
title: "eez:on"
---

Run a block of commands on another EEZ chain synchronously from the current one. Every call the block produces goes out through the target's cross-chain proxy and executes on the other side atomically with this transaction; helpers, conditions and loops inside evaluate on that chain. Creates each missing proxy first and estimates the gas the composed calls need.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
eez:on <chain> <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `chain` | `chain` | EEZ chain the block runs on (`eezL2`, or its chain id) |
| `block` | `block` | Commands whose calls execute on that chain (`exec`, `if`, `loop`, other modules' commands) |

## Examples

```evml
# From L1, set a value on a rollup contract in one atomic transaction
switch eezL1
eez:on eezL2 (
  exec 0x000000000000000000000000000000000000bEEF setValue(uint256) 42
)
```

<!-- HAND-WRITTEN -->

## How it works

An EEZ rollup and its L1 share one sequencer, so a call can cross between them inside a single transaction. On the sending chain every remote contract has a deterministic *cross-chain proxy*; calling the proxy with ordinary calldata runs the call on the other side, and the return value (or revert) comes back in the same transaction.

`eez:on` interprets its block as if the script had switched to the target chain, then brings every call it produced back home as a call through that target's proxy:

- Everything inside evaluates on the target chain: `exec` encodes against contracts there, `@token`, `@balance` and `::` reads resolve there, and so do the conditions of `if` and `loop`. Other modules' commands work too, as long as they produce plain contract calls.
- `@sender` inside the block is the caller's own cross-chain proxy on the target chain, which is what contracts there see as `msg.sender`. `@me` stays the connected wallet.
- Each distinct target gets its proxy created with a preceding transaction if nobody has yet; the calls follow, one sending-chain transaction each. A `batch` inside the block stays a batch: its calls are routed the same way and sent atomically from the sending chain by the wallet (an EIP-7702 account or a Safe), so `eez:on eezL2 ( batch ( … ) )` and `batch ( eez:on eezL2 ( … ) )` mean the same. There is no batching in the EEZ registry itself: several proxy calls in one transaction are simply several cross-chain entries.
- Gas is estimated by simulating each remote leg on the other chain and adding the protocol overhead (the sending chain itself cannot estimate a cross-chain call). Pass `--gas` on the inner command if a call still runs out of gas or is evicted; `--value` and `--from` on the inner command pass through as well.
- Blocks nest: `eez:on eezL2 ( eez:on eezL1 ( … ) )` goes L1 → L2 → L1 and comes back in the same transaction, through the proxy of a proxy. The inner block's calls are routed on the rollup first, then routed again from the sending chain; a proxy the inner block needs on the rollup is created there through the rollup registry's own proxy, atomically with the rest. Each extra hop adds the sending chain's overhead to the gas estimate. The devnet composes at least six hops.
- Not allowed inside the block: `switch` and contract deployments.
- The EEZ chains are reached through EVMcrispr's EEZ RPC, which forwards ordinary transactions to the devnet and hands cross-chain ones to the EEZ cross-chain ingress, so any wallet works with the one network entry — no special submission step.
- A receipt on the sending chain means the cross-chain effect was applied atomically; the rollup's state reflects it a few seconds later.
- A contract on the current chain whose code calls a proxy needs no special command: a plain `exec` reaches across the same way.

## See Also

- [eez:deploy-proxy](deploy-proxy.md) — create the proxy explicitly
- [@eez:proxy](../helpers/proxy.md) — resolve the proxy address without calling
- [@eez:on](../helpers/on.md) — read the other chain from the script
