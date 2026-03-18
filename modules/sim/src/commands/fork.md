---
title: "sim:fork"
---

Fork the blockchain and execute commands in a simulation.

## Syntax

```evml
sim:fork <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `block` | `block` | Commands to execute in the fork |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--block-number` | `number` | Block number to fork from |
| `--from` | `address` | Default sender address |
| `--auth-token` | `string` | RPC provider authentication token |
| `--using` | `simulation-mode` | Simulation backend (anvil, hardhat, tenderly, ethereumjs) |

## Examples

```evml
# Fork and set account balance
sim:fork --using anvil (
  sim:set-balance @me 100e18
)
```

<!-- HAND-WRITTEN -->

## Notes

- Supported backends: `anvil`, `hardhat`, `tenderly`, `ethereumjs` (default)
- The `ethereumjs` backend runs entirely in the browser — no external node needed
- All commands inside the fork block execute against the simulated state
- Changes do not affect the real chain

## See Also

- [set-balance](set-balance.md) — set account ETH balances
- [expect](expect.md) — assert conditions
- [wait](wait.md) — advance time
