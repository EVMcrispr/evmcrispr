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
| `$eez:registry` | `address` | — | EEZ registry on the current chain: the L1 `EEZ` contract or the rollup's `EEZL2` manager. Known for the ChiadoX testnet chains; set it to use another deployment (e.g. a local enclave). |
| `$eez:rollupId` | `number` | — | EEZ rollup id of the current chain (0 for L1). Known for the ChiadoX testnet chains. |
| `$eez:faucetKey` | `bytes32` | — | Private key of a funded account that `eez:faucet` sends from. The hosted networks have none (their rollups are funded by bridging); set it for a devnet with a pre-funded key, such as a local enclave. |

## Chains

Networks this module ships. They are available to `switch` as soon as the module is registered, with the RPC below unless the host overrides it.

| Chain | Key | Id | RPC | Explorer |
|-------|-----|----|-----|----------|
| EEZ L2 (testnet) | `eezL2` | `699169` | <https://chiadox.eez.dev/composer/l2> | <https://chiadox.eez.dev/explorer> |
| RollupX | `rollupX` | `696991` | <https://rollupx.eez.dev/composer/l2> | <https://rollupx.eez.dev/explorer> |

## Gateways

In a script that loads this module, a cross-chain transaction on these chains is priced by the gateway just before it is signed, sent at the quoted fees, and submitted there by a local key. Where the gateway is not the chain's own RPC, an ordinary transaction is not shown to it.

| Chain id | Gateway |
|----------|---------|
| `10200` | <https://chiadox.eez.dev/composer/l1> |
| `699169` | <https://chiadox.eez.dev/composer/l2> |
| `1` | <https://rollupx.eez.dev/composer/l1> |
| `696991` | <https://rollupx.eez.dev/composer/l2> |

## Commands

| Command | Description |
|---------|-------------|
| [eez:deploy-proxy](src/commands/deploy-proxy.md) | Create the cross-chain proxy on the current chain for a contract on another EEZ rollup. Does nothing if it already exists. |
| [eez:faucet](src/commands/faucet.md) | Send devnet ETH to an account from a pre-funded key set in $eez:faucetKey, so a fresh wallet can pay for gas on a devnet that has one (a local enclave). The faucet signs the transfer itself; nothing is asked of the connected wallet. The hosted ChiadoX testnet has no such key: its rollup is funded by bridging. |
| [eez:on](src/commands/on.md) | Run a block of commands on another EEZ chain synchronously from the current one. Every call the block produces goes out through the target's cross-chain proxy and executes on the other side atomically with this transaction; helpers, conditions and loops inside evaluate on that chain. Creates each missing proxy first and estimates the gas the composed calls need. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@eez:on](src/helpers/on.md) | `any` | Evaluate an expression as if the script were on another chain, and return its value: helpers, `::` calls, variables and arithmetic resolve against that chain (reads only). |
| [@eez:proxy](src/helpers/proxy.md) | `address` | Address on the current chain of the cross-chain proxy standing in for a contract on another EEZ chain. Deterministic, so it resolves whether or not the proxy has been created yet. |
| [@eez:target](src/helpers/target.md) | `address` | The remote contract a cross-chain proxy stands in for: the reverse of @eez:proxy. Fails if the address is not a registered proxy on that chain. |

