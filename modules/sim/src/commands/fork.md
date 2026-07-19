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
| `--using` | `simulation-mode` | Simulation backend (anvil, hardhat, tenderly, tenderly-multichain, ethereumjs) |

## Examples

```evml
# Fork and set account balance
sim:fork --using anvil (
  sim:set-balance @me 100e18
)
```

<!-- HAND-WRITTEN -->

## Notes

- Supported backends: `anvil`, `hardhat`, `tenderly`, `tenderly-multichain`, `ethereumjs` (default)
- The `ethereumjs` backend runs entirely in the browser — no external node needed
- All commands inside the fork block execute against the simulated state
- Changes do not affect the real chain
- `batch (...)` inside a fork simulates an EIP-7702 batch: if the sender EOA
  has no delegation yet, the fork installs a delegation to MetaMask's
  EIP7702StatelessDeleGator (`0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B`) and
  executes all batched calls atomically in a single self-call transaction. An
  existing delegation on the EOA is reused as-is.

## Cross-chain simulation

A fork is **multichain**: `switch` inside a fork block moves between one fork per chain instead of failing, and each chain keeps its own state, so switching back and forth is safe.

```evml
load sim
load bridges

sim:fork --using anvil (
  bridges:bridge 100e6 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 base --using CCTPv2
  switch base
  set $balance @get(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 "balanceOf(address)(uint256)" @me)
  sim:expect @bool($balance > 0)
)
```

Bridge transfers are **auto-relayed**. When a bridge transaction executes, the fork scans its receipt for the source event; switching to the destination chain then executes the destination leg there — a mocked Circle attestation driving the real `receiveMessage` mint for CCTP, an impersonated relayer fill for Across, an impersonated endpoint calling `lzReceive` for LayerZero, a replayed deposit for the canonical bridges. `bridges:claim` is therefore unnecessary inside a fork. Transfers whose destination chain the script never switches to are reported when the block ends.

Each backend hosts the extra chains differently:

| Backend | How it goes multichain |
|---------|------------------------|
| `ethereumjs` (default) | One in-memory fork per chain, created on the first `switch` |
| `tenderly` | One Virtual TestNet per chain |
| `tenderly-multichain` | A single multichain Virtual Environment holding every chain the script switches to (one dashboard, one teardown). Its networks are attached when the environment is created, so `switch` targets must be literal |
| `anvil` / `hardhat` | The single local node is re-forked on each switch, saving and restoring each chain's state (needs `dumpState`/`loadState`, which Anvil supports) |

Limitations: secondary chains fork at their latest block (`--block-number` pins only the starting chain), each fork keeps its own clock (`wait` advances the active one), and a delivered destination leg is not itself relayed onward.

## See Also

- [set-balance](set-balance.md) — set account ETH balances
- [expect](expect.md) — assert conditions
- [wait](../../../std/src/commands/wait.md) — advance time
