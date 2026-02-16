# @evmcrispr/module-sim

Simulation module for EVMcrispr. It lets you fork a live chain into a local (or remote) simulation backend and run EVMcrispr scripts against it — no real funds at risk.

## Supported backends

| Backend | Type | Notes |
| --- | --- | --- |
| **Anvil** (Foundry) | Local | Recommended. Fast, lightweight. |
| **Hardhat** (v2) | Local | Classic alternative. |
| **Tenderly** | Remote | Virtual TestNets with a web explorer. |

## Quick start

Load the module at the top of your script:

```
load sim
```

Then wrap your commands inside a `sim:fork` block.

### Anvil (recommended)

Install [Foundry](https://book.getfoundry.sh/getting-started/installation) and start Anvil:

```bash
anvil
```

Anvil will listen on `http://localhost:8545` by default.

> For the fork to work against a live chain, the terminal app needs an upstream RPC. It will work well if your `.env` has `VITE_DRPC_API_KEY` set.

Then run your script:

```
load sim

sim:fork --using anvil (
  # your commands here
)
```

You can optionally pin the fork to a specific block number:

```
load sim

sim:fork --using anvil --block-number 18000000 (
  # your commands here
)
```

### Hardhat (v2)

Create a Hardhat project and start the node:

```bash
mkdir hardhat_test
cd hardhat_test
npx hardhat init
# Select Hardhat 2 when prompted
npx hardhat node
```

This starts a JSON-RPC server on `http://localhost:8545`. Then run your script from the EVMcrispr terminal:

```
load sim

sim:fork --using hardhat (
  # your commands here
)
```

### Tenderly

With Tenderly you don't need a local node — a Virtual TestNet is created automatically via the API. You need to provide your Tenderly credentials in the format `user/project/accessKey`.

You can generate an access key at <https://dashboard.tenderly.co/account/authorization>.

```
load sim

sim:fork --tenderly myUser/myProject/myAccessKey (
  # your commands here
)
```

After execution you'll get a link to view all transactions on the Tenderly dashboard.

## Commands

All commands below (except `fork` and `expect`) can only be used **inside** a `sim:fork` block.

### `sim:fork`

Fork a live chain into a simulation backend.

**Options:**

| Option | Type | Description |
| --- | --- | --- |
| `--using` | `anvil` \| `hardhat` \| `tenderly` | Local backend to use. |
| `--tenderly` | `string` | Tenderly credentials (`user/project/accessKey`). |
| `--block-number` | `number` | Pin the fork to a specific block. |
| `--from` | `address` | Override the connected account (sender). |

### `sim:set-balance`

Set the native token balance of an address.

```
sim:set-balance <address> <amount>
```

### `sim:set-code`

Replace the bytecode deployed at an address.

```
sim:set-code <address> <bytecode>
```

### `sim:set-storage-at`

Write a value to a specific storage slot of a contract.

```
sim:set-storage-at <address> <slot> <value>
```

### `sim:wait`

Advance the chain clock by a given duration (in seconds). Optionally specify a block period.

```
sim:wait <duration> [period]
```

### `sim:expect`

Assert a condition. Useful for verifying state after simulated transactions.

```
sim:expect <value> <operator> <expectedValue>
```

Supported operators: `==`, `!=`, `>`, `>=`, `<`, `<=`.

## Example

```
load sim

sim:fork --using anvil --block-number 18000000 (
  sim:set-balance @me 100e18
  # ... run transactions ...
  sim:expect $result == 1
)
```
