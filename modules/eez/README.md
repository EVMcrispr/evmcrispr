# eez module

Ethereum Economic Zone: call a contract on the other side of an EEZ rollup synchronously, through its deterministic cross-chain proxy. Point the script at an EEZ chain, then eez:call any L1 contract from the rollup (or any rollup contract from L1) with plain calldata; the proxy is created on first use and the transaction is routed through the EEZ cross-chain ingress.

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
| `$eez:front` | `string` | — | Cross-chain ingress URL that cross-chain transactions from the current chain are submitted to. Known for the EEZ devnet chains. |
| `$eez:faucetKey` | `bytes32` | — | Private key of a funded account that `eez:faucet` sends from. Known for the EEZ devnet chains (a public hardhat key); set it for another devnet. |

## Chains

Networks this module ships. They are available to `switch` as soon as the module is registered, with the RPC below unless the host overrides it.

| Chain | Id | RPC | Explorer |
|-------|----|-----|----------|
| EEZ Devnet L1 (testnet) | `7331` | <http://91.134.73.215:8545> | <http://91.134.73.215:4000> |
| EEZ Devnet L2 (testnet) | `6290` | <http://65.109.26.16:18688> | <http://65.109.26.16:8088> |

## Commands

| Command | Description |
|---------|-------------|
| [eez:call](src/commands/call.md) | Call a contract on another EEZ rollup synchronously from the current chain, through its cross-chain proxy: the call executes on the other side atomically with this transaction. Creates the proxy first if it does not exist yet, and submits the call through the EEZ cross-chain ingress. |
| [eez:faucet](src/commands/faucet.md) | Send devnet ETH to an account from the EEZ devnet's pre-funded faucet key, so a fresh wallet can pay for gas. The faucet signs the transfer itself; nothing is asked of the connected wallet. |
| [eez:proxy](src/commands/proxy.md) | Create the cross-chain proxy on the current chain for a contract on another EEZ rollup. Does nothing if it already exists. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@eez:on](src/helpers/on.md) | `any` | Evaluate an expression as if the script were on another chain, and return its value. Reads only: helpers, `::` calls, variables and arithmetic all resolve against that chain, then the script continues on its own chain. |
| [@eez:proxy](src/helpers/proxy.md) | `address` | Address on the current chain of the cross-chain proxy standing in for a contract on another EEZ rollup. Deterministic, so it resolves whether or not the proxy has been created yet. |
| [@eez:target](src/helpers/target.md) | `address` | The remote contract a cross-chain proxy on the current chain stands in for. Fails if the address is not a registered proxy. |

