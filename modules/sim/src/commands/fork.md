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

## Fees

On the in-process backends (`ethereumjs` and `revm`) a transaction pays a fee
only when it gives one. `exec` and `send` with `--max-fee-per-gas` or
`--max-priority-fee-per-gas` pay what their gas used costs at the EIP-1559
price, `min(max fee, base fee + priority fee)`, against the base fee of the
forked block. A missing priority fee is 0, and a missing max fee is the base
fee plus the priority fee. A max fee below the base fee is refused, as is a
sender that cannot pay for the gas it used (nothing of the transaction is
kept). Contracts read that price with `GASPRICE`, and the block's base fee
with `BASEFEE`.

A transaction that gives no fee runs free, at a gas price of 0, so an
impersonated account needs no funds for gas. No block producer is paid (the
fork's coinbase is the zero address), and the base fee stays the forked
block's for the whole fork.

```evml
load sim

sim:fork --using revm (
  sim:set-balance @me 1e18
  send 0x000000000000000000000000000000000000dEaD --value 1 --max-priority-fee-per-gas 1e9
  sim:expect @bool(@balance(ETH @me) < 1e18 - 1)
)
```

## Frame transactions

A `frames:tx` runs in the fork when the fork is of a frame network
(`altMempoolDevnet`, `hegotaDevnet`, or the local `framesQuick`,
`framesMining` and `framesAltMempool` devnets; a node on the id of one of
the public two is
simulated by its family's rules) and
the backend is in-process (`--using ethereumjs` or `--using revm`): its
frames run in order with the EIP-8141 opcodes, the validation prefix first
(a frame that fails or does not approve makes the transaction invalid, and
nothing of it runs), then the body (a failed frame does not stop the next,
unless it is in a `batch`, which rolls back as a whole). The sender's own
verify frame is impersonated, as `--as` impersonates a sender: a simulation
holds no signature. A sponsor's or paymaster's verify frame runs.

After it, `sim:expect` and assertions see its effects, and the fork logs each
frame that did not succeed and, for each call without `--gas`, the gas it used
and the `--gas` to send it with. A frame's gas is charged as the network's
client charges it, measured on each: on the alt-mempool and local devnets it
includes what the frame pays to reach its target (100 when warm, 3000 when
cold); on the Hegota devnet reaching a target costs nothing, and a frame to a
precompile or to an account without code uses none of its own gas (the
client charges that to the transaction).

On the Hegota devnet a frame also runs that client's gas schedule, as
ethrex's `hegota-devnet` build does: Amsterdam's rules with EIP-8038's access
and write costs (a cold account or slot 3000, the first change of a slot
10,000, a value transfer 10,300, CREATE 11,000), and EIP-8037's state gas for
the state a frame creates (1530 a byte: 97,920 for a new slot, 183,600 for a
new account, 1530 a byte of deployed code). A frame's state gas comes from its
own `--state-gas` alone: a charge it cannot cover halts the call as out of gas,
and what a cleared slot or a reverted call gives back does not refill it. Each
frame's receipt reports its state gas, net and never below 0. A frame's target
starts cold (its own code warms it), precompiles warm. A frame that an atomic
group's failure rolls back keeps its status, as the chain reports it: its
changes and logs are gone, and the run says so.

On the Hegota devnet, `post-verify` frames (POST_TX) run after the body, as
static calls, with TXTRACE and EVENTDATACOPY answered from what the body
changed (net, since the transaction's start) and the logs of the frames that
took effect; a failing one reverts the body, skips the checks after it, and
stops the run naming it, as sending the transaction would. As on the chain,
every value transfer to another account emits an EIP-7708 log (from
`0xff…fe`, `Transfer(from, to)`, the amount as data), so a check that reads
events sees them.

`sim:fork --on hegotaDevnet` forks the public Hegota devnet. To fork a local
node on its id (a Kurtosis devnet), set the id's RPC to it (in the CLI,
`EVMCRISPR_RPC_URL_3151908`).

With `--max-fee-per-gas` or `--max-priority-fee-per-gas` on `frames:tx`, the
payer (the account or sender that approved paying, or its sponsor) pays the
frames' gas used at the price above, and a payer that cannot pay makes the
transaction invalid. Without them it runs free, like any transaction here.
On the Hegota devnet, as on the chain, the payer is charged the most the
transaction can cost when it approves (the max fee times the intrinsic gas and
every frame's limits, or EIP-8141's calldata floor when that is more; a payer
that cannot cover it makes the transaction invalid; a transaction with a call
that has no `--gas`, the run that sizes it, has no limits to price and is not
charged), so the body and the `post-verify` checks see that charge, and the
part not used comes back after the last frame. The signature is priced as the
send will carry it: a plain sender's secp256k1 one (2800 gas to verify), a
frame account's owner signature as an ARBITRARY entry its code checks (100).
Its 65 bytes are priced as if none were zero, since the signature does not
exist yet: a real one with zero bytes costs 12 gas less for each (for a plain
sender often its first byte, `v`; for a frame account only a byte of `r` or
`s`), so a check of the payer's exact balance can differ by that much.

The fee is the gas used at that price: on the Hegota devnet, as the chain
counts it, the transaction's intrinsic gas and each frame's execution and
state gas, less the storage refunds of the frames that took effect (at most a
fifth), or EIP-8141's calldata floor when that is more; elsewhere the frames'
gas alone.

Not modelled: the ERC-8421 mempool's admission rules.

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
