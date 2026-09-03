---
title: "@eez:on"
---

Evaluate an expression as if the script were on another chain, and return its value: helpers, `::` calls, variables and arithmetic resolve against that chain (reads only).

**On-chain (`@eez:on!`)**: Reads the other chain through the proxy of its Assertions core, so the assertion runs as a transaction; one hop only, not simulable.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `any`

## Syntax

```evml
@eez:on(chain expression)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `chain` | `chain` | Chain to evaluate on (`eezL2`, a viem name or a chain id) |
| `expression` | `any` | Expression evaluated as if the script had switched to that chain |

## Examples

```evml
# From L1, read the connected account's balance on the rollup
switch eezL1
print @eez:on(eezL2 @balance(ETH @me))
```

<!-- HAND-WRITTEN -->

## Notes

- The expression runs with the script's client switched to the target chain and the previous client restored afterwards — inside a `sim:fork` the fork is kept. Everything inside resolves against the target chain: `@balance`, `@token:balance`, `::` reads, other modules' helpers (e.g. `@eez:proxy` computes the proxy on that chain), nested `@eez:on`.
- Read-only by construction: helpers cannot emit actions, so `exec`-style writes are not possible inside the expression. Use the [eez:on](../commands/on.md) command to write.
- Module config variables (`$eez:registry`, `$std:tokenlist`, …) are global, not per chain: a value `set` for the script's own chain is also seen while evaluating on the other one.
- Editor completions inside the expression assume the script's current chain, not the target.
- This is the off-chain face. The on-chain face (`@eez:on!`, usable inside `assert` for a synchronous cross-rollup read) needs the on-chain helper runtime deployed on the target rollup and is not available yet.

## On-chain face (@eez:on!)

A synchronous cross-rollup read inside an assertion. The inner expression compiles as if the script were on the other chain (so `@balance!`, `::` reads and every nested on-chain helper resolve there), and is evaluated at assertion time through this chain's cross-chain proxy of the Assertions core deployed over there: a static call the EEZ sequencer composes, returning the remote value inline.

```evml
switch eezL1
assert @eez:on!(eezL2 @balance!(ETH @me)) >= 1e18 "not enough on the rollup"
```

- The assertion becomes a transaction. Only a transaction reaches the composer; an `eth_call` through a proxy always fails with `ExecutionNotFound()`. Inside a `batch` it already is one. It cannot be simulated in `sim:fork`, since a fork has no composer.
- The proxy of the remote core must exist on this chain first (`eez:deploy-proxy 0xA55E472841ca3D318205036724A94F5abDbf7b18 --chain eezL2`); `@eez:on!` reverts otherwise.
- `@me` compiles to the literal wallet address, so `@balance!(ETH @me)` on the rollup is the wallet's balance there. Anything on the far side that looks at `msg.sender` sees the proxy of the caller instead.
- One hop only: the devnet composes a static read across one chain boundary, not `@eez:on!` inside `@eez:on!`.
- A constant inner expression is folded at composition time and never crosses; `@eez:on!(eezL1 …)` from L1 is just the inner expression.

## See Also

- [eez:on](../commands/on.md) — run a block of commands on the other rollup atomically
