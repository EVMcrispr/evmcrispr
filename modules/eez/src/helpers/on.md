---
title: "@eez:on"
---

Evaluate an expression as if the script were on another chain, and return its value. Reads only: helpers, `::` calls, variables and arithmetic all resolve against that chain, then the script continues on its own chain.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `any`

## Syntax

```evml
@eez:on(chain expression)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `chain` | `chain` | Chain to evaluate on (id or viem name, e.g. `6290`) |
| `expression` | `any` | Expression evaluated as if the script had switched to that chain |

## Examples

```evml
# From L1, read the connected account's balance on the rollup
print @eez:on(eezL2 @balance(ETH @me))
```

<!-- HAND-WRITTEN -->

## Notes

- The expression runs with the script's client switched to the target chain and the previous client restored afterwards — inside a `sim:fork` the fork is kept. Everything inside resolves against the target chain: `@balance`, `@token:balance`, `::` reads, other modules' helpers (e.g. `@eez:proxy` computes the proxy on that chain), nested `@eez:on`.
- Read-only by construction: helpers cannot emit actions, so `exec`-style writes are not possible inside the expression.
- Module config variables (`$eez:registry`, `$std:tokenlist`, …) are global, not per chain: a value `set` for the script's own chain is also seen while evaluating on the other one.
- Editor completions inside the expression assume the script's current chain, not the target.
- This is the off-chain face. The on-chain face (`@eez:on!`, usable inside `assert` for a synchronous cross-rollup read) needs the on-chain helper runtime deployed on the target rollup and is not available yet.

## See Also

- [eez:call](../commands/call.md) — write to the other rollup atomically
