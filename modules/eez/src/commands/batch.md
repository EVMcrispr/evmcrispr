---
title: "eez:batch"
---

Run a block of commands on another EEZ chain as one atomic cross-chain call: every call the block produces executes over there from your own cross-chain proxy, in order, all or nothing. One sending-chain transaction, one cross-chain entry, however many calls. Helpers, conditions and loops inside evaluate on that chain.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
eez:batch <chain> <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `chain` | `chain` | EEZ chain the block runs on (`eezL2`, or its chain id) |
| `block` | `block` | Commands whose calls execute on that chain, atomically (`exec`, `if`, `loop`, other modules' commands) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--gas` | `number` | Gas limit for the whole batch, instead of the estimate from simulating it on the other chain |

<!-- HAND-WRITTEN -->

## How it works

`eez:on` sends one cross-chain call per command in its block, each its own transaction on the sending chain. `eez:batch` sends one call that carries them all, addressed to yourself: it goes to the proxy, on the current chain, *of your own proxy on the target chain*. Over there your proxy receives the list from itself, which only the EEZ manager can make it do, and runs the calls one after the other as itself. A revert anywhere undoes the whole batch, and nothing is applied on either chain.

- Everything inside evaluates on the target chain, exactly as in `eez:on`: `exec` encodes against contracts there, reads resolve there, and so do `if` and `loop`.
- `msg.sender` of every call is your cross-chain proxy on the target chain, the same identity `eez:on` gives a single call. `@sender` inside the block is that proxy; `@me` stays the wallet. A contract that grants something to your proxy sees the same account whether you batch or not.
- The calls are encoded as an ERC-7579 `Execution[]` (`target`, `value`, `callData`), the batch encoding EIP-7702 delegations and smart accounts share, passed to the proxy's `executeBatch`. `--value` on an inner command is carried by that call; the batch transaction is funded with the sum.
- The proxy of your far-side proxy is created first if nobody has done so yet, like any other target of `eez:on`. Your far-side proxy itself needs no preparation: the manager over there creates it on your first call, batch or not.
- Gas is estimated by simulating the whole batch on the other chain, from your proxy there, plus the protocol overhead, and a batch that would revert stops the script with the reason before anything is sent. A far-side proxy that does not exist yet cannot be simulated and gets a fixed budget. Each call inside that itself crosses chains again (a nested `eez:on`) adds one more hop's overhead. `--gas` on `eez:batch` replaces the estimate; `--gas` and `--from` are not accepted on the commands inside, since the batch is one call from one sender.
- A `batch ( … )` inside the block is simply flattened: everything in an `eez:batch` is atomic already. The other way round, `batch ( eez:batch … )`, is a wallet batch containing the one cross-chain call.
- Needs cross-chain proxies that support `executeBatch`, which the devnet does not run yet. While that is so the command refuses to send once your far-side proxy exists and shows old code; before it exists there is nothing to check, and the composer would evict the transaction silently.
- Not allowed inside the block: `switch` and contract deployments.

## When to use which

- `eez:batch`: several calls on the other chain that must succeed together, from your proxy, in one entry. Cheapest and simplest.
- `batch ( eez:on … )`: several *separate* cross-chain calls sent atomically by a wallet that batches (an EIP-7702 account or a Safe). Use it when the calls must be distinct entries, or when they mix chains and directions.
- `eez:on` on its own: independent calls, one transaction each.

## See Also

- [eez:on](on.md) — one call per command, one transaction each
- [@eez:proxy](../helpers/proxy.md) — resolve the proxy address without calling
