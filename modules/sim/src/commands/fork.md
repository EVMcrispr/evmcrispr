---
title: "sim:fork"
---

Fork the blockchain and execute commands in a simulation.

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
sim:fork <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `block` | `block` | Build time | Commands to execute in the fork |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--block-number` | `number` | Build time | Block number to fork from |
| `--as` | `address` | Build time | Account the block is run by: `@me` inside the fork, impersonated for every transaction that names no other sender. Defaults to the connected account. |
| `--on` | `chain` | Build time | Chain to fork (name or id), and the chain --block-number is a block of. Defaults to the current chain. |
| `--from` | `address` | Build time | Deprecated: use --as. |
| `--auth-token` | `string` | Build time | RPC provider authentication token |
| `--using` | `simulation-mode` | Build time | Simulation backend (anvil, hardhat, tenderly, tenderly-multichain, ethereumjs, revm) |

## Examples

```evml
# Fork and set account balance
sim:fork --using anvil (
  sim:set-balance @me 100e18
)

# Run the block as another account
sim:fork --as 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (
  sim:set-balance @me 100e18
)
```

<!-- HAND-WRITTEN -->

## Account and chain

`--as` names the account the block is run by, and `--on` the chain the
fork is of. They are the options of [`switch`](../../../std/src/commands/switch.md),
which works the same way inside a fork:

```evml
load sim

set $who 0x44fA8E6f47987339850636F88629646662444217

sim:fork --as $who --on gnosis (
  sim:set-balance @me 100e18
  exec 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d "deposit()" --value 1e18
)
```

- Inside `--as`, `@me` is that account and every transaction that names no
  other sender is sent from it (impersonated). `--from` did the same and
  is deprecated.
- `--on` forks the named chain whatever chain the script is on, and
  `--block-number` is a block of that chain. Without it the fork is of the
  current chain.
- When the block ends, the script is back on the chain and the account it
  had before the fork.
- A `switch` without a block inside the fork holds until the end of the
  block it is written in: the fork itself, or an `if` or `loop` inside it.
- The fork's block is a block like any other: when it ends, the fork is
  back on the chain it started on (nothing happens if it never left it).

## Notes

- Supported backends: `anvil`, `hardhat`, `tenderly`, `tenderly-multichain`, `ethereumjs` (default), `revm`
- The `ethereumjs` and `revm` backends run entirely in the browser — no external node needed
- `revm` executes on the Rust EVM compiled to WebAssembly: much faster opcode
  execution than `ethereumjs` on compute-heavy simulations, with identical
  semantics (state still streams lazily from the upstream RPC)
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
  bridges:bridge 100e6 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 to base --using CCTPv2
  switch base
  set $balance @get(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 "balanceOf(address)(uint256)" @me)
  sim:expect @bool($balance > 0)
)
```

Bridge transfers are **auto-relayed**. When a bridge transaction executes, the fork scans its receipt for the source event; switching to the destination chain then executes the destination leg there — a mocked Circle attestation driving the real `receiveMessage` mint for CCTP, an impersonated relayer fill for Across, an impersonated endpoint calling `lzReceive` for LayerZero, a replayed deposit for the canonical bridges. `bridges:claim` is therefore unnecessary inside a fork. When the block ends on another chain than the one the fork started on, the fork returns to its starting chain, as any block puts its chain back, and transfers bound for it are delivered then. Transfers whose destination chain the fork is never on are reported when the block ends.

Each backend hosts the extra chains differently:

| Backend | How it goes multichain |
|---------|------------------------|
| `ethereumjs` (default) | One in-memory fork per chain, created on the first `switch` |
| `revm` | Same as `ethereumjs`: one in-memory (WASM) fork per chain |
| `tenderly` | One Virtual TestNet per chain |
| `tenderly-multichain` | A single multichain Virtual Environment holding every chain the script switches to (one dashboard, one teardown). Its networks are attached when the environment is created, so `switch` targets must be literal |
| `anvil` / `hardhat` | The single local node is re-forked on each switch, saving and restoring each chain's state (needs `dumpState`/`loadState`, which Anvil supports) |

Limitations: secondary chains fork at their latest block (`--block-number` pins only the starting chain), each fork keeps its own clock (`wait` advances the active one), and a delivered destination leg is not itself relayed onward.

## See Also

- [set-balance](set-balance.md) — set account ETH balances
- [expect](expect.md) — assert conditions
- [wait](../../../std/src/commands/wait.md) — advance time
