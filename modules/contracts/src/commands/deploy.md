---
title: "contracts:deploy"
---

Deploy a contract from raw creation bytecode. Binds the predicted address to <variable>. Mirror an existing deployment with --mirror-chain / --mirror-address (fetches the original creation bytecode from Etherscan).

## Syntax

```evml
contracts:deploy <variable> [bytecode]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the deployed contract address to |
| `[bytecode]` | `bytes` | Creation bytecode. Constructor args are appended automatically when --constructor is set. Omit when using --mirror-chain / --mirror-address to mirror an existing deployment. |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--mirror-chain` | `chain` | Chain (id or viem name like `optimism`) to fetch the creation bytecode from (Etherscan V2). Defaults to the current chain when only --mirror-address is set. Requires --mirror-address. |
| `--mirror-address` | `address` | Address of an existing deployment to mirror. The original creation bytecode (with constructor args already appended) is fetched from Etherscan and used as the init code for this deployment. |
| `--constructor` | `string` | Constructor signature like `constructor(uint256,address)`. Requires --constructor-args. Mutually exclusive with --mirror-address. |
| `--constructor-args` | `array` | Constructor arguments as an array literal, e.g. [100e18 @me true]. Requires --constructor. |
| `--create2` | `bytes32` | Salt for CREATE2 deployment. Defaults to the Arachnid deterministic deployer; override factory with --via. |
| `--create3` | `bytes32` | Salt for CREATE3 deployment. Defaults to the CreateX factory; override with --via. |
| `--via` | `address` | Override the default factory address used by --create2 / --create3. |
| `--from` | `address` | Sender address. Defaults to the connected wallet. For plain CREATE this is also the prediction deployer. |
| `--value` | `number` | ETH to send with the deployment (in wei) |
| `--gas` | `number` | Gas limit |
| `--max-fee-per-gas` | `number` | Max fee per gas (EIP-1559) |
| `--max-priority-fee-per-gas` | `number` | Max priority fee per gas (EIP-1559) |
| `--nonce` | `number` | Transaction nonce override |

<!-- HAND-WRITTEN -->

## Examples

```evml
load contracts

# Plain CREATE deployment from raw bytecode
contracts:deploy $addr 0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe

# Deploy with constructor arguments
contracts:deploy $token 0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe --constructor "constructor(string,string,uint8)" --constructor-args ["My Token" "MTK" 18]

# CREATE2 via the Arachnid deterministic deployer (default)
contracts:deploy $vault 0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe --create2 0x0000000000000000000000000000000000000000000000000000000000000001

# CREATE2 via a custom factory (must accept salt || initCode calldata)
contracts:deploy $vault2 0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe --create2 0x0000000000000000000000000000000000000000000000000000000000000001 --via 0x4e59b44847b379578588920ca78fbf26c0b4956c

# CREATE3 via the CreateX factory (default)
contracts:deploy $proxy 0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe --create3 0x0000000000000000000000000000000000000000000000000000000000000002 --constructor "constructor(address)" --constructor-args [@me]

# Mirror an existing deployment from another chain — fetches the
# original creation bytecode (with constructor args already baked in)
# from Etherscan and replays it byte-for-byte on the current chain.
contracts:deploy $clone --mirror-chain 1 --mirror-address 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2

# Same flow, deterministically pinned to a CREATE2 address so the
# clone lands at the same address on every chain that runs this script.
contracts:deploy $clone2 --mirror-chain 1 --mirror-address 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --create2 0x0000000000000000000000000000000000000000000000000000000000000003

# Use the bound address in subsequent calls
exec $token "transfer(address,uint256)" @me 1e18
```

## Modes

- **CREATE** (default): the EVM derives the address from `(--from, nonce)`. The
  command uses an internal per-script nonce counter so multiple deploys in the
  same script chain correctly.
- **CREATE2** (`--create2 <salt>`): tx is sent to a CREATE2 factory with calldata
  `salt(32) || initCode`. The default factory is the Arachnid deterministic
  deployer at `0x4e59b44847b379578588920ca78fbf26c0b4956c`. The predicted address
  depends on `(factory, salt, initCode)` only, so changing `--from` does not
  affect it.
- **CREATE3** (`--create3 <salt>`): tx calls `deployCreate3(bytes32,bytes)` on a
  CreateX-compatible factory (default `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`).
  The deployed address depends only on `(factory, salt)`, not on the bytecode.
  Permissioned salts (first 20 bytes equal `--from`, or zero-prefixed with
  `0x01` in byte 20) are rejected so client-side prediction stays deterministic.
- **Mirror** (`--mirror-address <addr> [--mirror-chain <id>]`): fetches the
  original creation bytecode of an existing deployment from Etherscan V2's
  `getcontractcreation` endpoint and uses it as the init code for this
  deployment. The fetched bytecode already includes the original ABI-encoded
  constructor arguments, so `--constructor` / `--constructor-args` are not
  allowed in this mode. Combine with `--create2` / `--create3` to pin the
  cloned contract to a deterministic address. Requires
  `VITE_ETHERSCAN_API_KEY`.

## Caveats

- A command and all of its options must be written on a single line — EVML
  has no `\` line continuation.
- A `deploy` action is a CREATE transaction (no `to` field) when neither
  `--create2` nor `--create3` is set. Such actions cannot be executed inside a
  `batch (...)` block via EIP-5792 wallet batching — use `--create2` or
  `--create3` if you need to batch deployments together with other calls.

## See Also

- [@contracts:next](../helpers/next.md) — predict the next CREATE address for an account
- [exec](exec.md) — call a contract function on the deployed address
- [send](send.md) — send a pre-encoded transaction or value transfer to an existing address
