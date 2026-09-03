# eez module

Ethereum Economic Zone: call a contract on the other side of an EEZ rollup synchronously, through its deterministic cross-chain proxy. Point the script at an EEZ chain, then wrap ordinary commands in eez:on to run them on the rollup from L1 (or on L1 from the rollup); each call goes through the target's proxy, created on first use, and the transaction is routed through the EEZ cross-chain ingress.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load eez
```

## Configuration variables

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$eez:registry` | `address` | — | EEZ registry on the current chain: the L1 `EEZ` contract or the rollup's `EEZL2` predeploy. Known for the EEZ devnet chains; set it to use another deployment (e.g. a local enclave). |
| `$eez:rollupId` | `number` | — | EEZ rollup id of the current chain (0 for L1). Known for the EEZ devnet chains. |
| `$eez:faucetKey` | `bytes32` | — | Private key of a funded account that `eez:faucet` sends from. Known for the EEZ devnet chains (a public hardhat key); set it for another devnet. |

## Chains

Networks this module ships. They are available to `switch` as soon as the module is registered, with the RPC below unless the host overrides it.

| Chain | Key | Id | RPC | Explorer |
|-------|-----|----|-----|----------|
| EEZ L1 (testnet) | `eezL1` | `7331` | <https://api.evmcrispr.com/experimental-eez-rpc/eezL1> | — |
| EEZ L2 (testnet) | `eezL2` | `6290` | <https://api.evmcrispr.com/experimental-eez-rpc/eezL2> | — |

## Commands

| Command | Description |
|---------|-------------|
| [eez:batch](src/commands/batch.md) | Run a block of commands on another EEZ chain as one atomic cross-chain call: every call the block produces executes over there from your own cross-chain proxy, in order, all or nothing. One sending-chain transaction, one cross-chain entry, however many calls. Helpers, conditions and loops inside evaluate on that chain. |
| [eez:deploy-proxy](src/commands/deploy-proxy.md) | Create the cross-chain proxy on the current chain for a contract on another EEZ rollup. Does nothing if it already exists. |
| [eez:faucet](src/commands/faucet.md) | Send devnet ETH to an account from the EEZ devnet's pre-funded faucet key, so a fresh wallet can pay for gas. The faucet signs the transfer itself; nothing is asked of the connected wallet. |
| [eez:on](src/commands/on.md) | Run a block of commands on another EEZ chain synchronously from the current one. Every call the block produces goes out through the target's cross-chain proxy and executes on the other side atomically with this transaction; helpers, conditions and loops inside evaluate on that chain. Creates each missing proxy first and estimates the gas the composed calls need. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@eez:on](src/helpers/on.md) | `any` | Evaluate an expression as if the script were on another chain, and return its value: helpers, `::` calls, variables and arithmetic resolve against that chain (reads only). |
| [@eez:proxy](src/helpers/proxy.md) | `address` | Address on the current chain of the cross-chain proxy standing in for a contract on another EEZ chain. Deterministic, so it resolves whether or not the proxy has been created yet. |
| [@eez:target](src/helpers/target.md) | `address` | The remote contract a cross-chain proxy stands in for: the reverse of @eez:proxy. Fails if the address is not a registered proxy on that chain. |

