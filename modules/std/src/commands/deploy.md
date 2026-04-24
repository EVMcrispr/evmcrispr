---
title: "deploy"
---

Deploy a contract from raw creation bytecode. Binds the predicted address to <variable>.

## Syntax

```evml
deploy <variable> <bytecode>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the deployed contract address to |
| `bytecode` | `bytes` | Creation bytecode. Constructor args are appended automatically when --constructor is set. |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--constructor` | `string` | Constructor signature like `constructor(uint256,address)`. Requires --constructor-args. |
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
# Plain CREATE deployment from raw bytecode
deploy $addr 0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe...

# Deploy with constructor arguments
deploy $token 0x6080604052... \
  --constructor "constructor(string,string,uint8)" \
  --constructor-args ["My Token" "MTK" 18]

# CREATE2 via the Arachnid deterministic deployer (default)
deploy $vault 0x6080604052... --create2 0x0000000000000000000000000000000000000000000000000000000000000001

# CREATE2 via a custom factory (must accept salt || initCode calldata)
deploy $vault 0x6080604052... --create2 0x0...01 --via 0xMyFactory0000000000000000000000000000000000

# CREATE3 via the CreateX factory (default)
deploy $proxy 0x6080604052... --create3 0x0000000000000000000000000000000000000000000000000000000000000002 \
  --constructor "constructor(address)" --constructor-args [@me]

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

## Caveats

- A `deploy` action is a CREATE transaction (no `to` field) when neither
  `--create2` nor `--create3` is set. Such actions cannot be executed inside a
  `batch (...)` block via EIP-5792 wallet batching — use `--create2` or
  `--create3` if you need to batch deployments together with other calls.

## See Also

- [@contract.next](../helpers/contract.next.md) — predict the next CREATE address for an account
- [exec](exec.md) — call a contract function on the deployed address
- [raw](raw.md) — send a pre-encoded transaction to an existing address
