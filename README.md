# EVMcrispr

[![](https://img.shields.io/github/package-json/v/commonsswarm/evmcrispr?label=npm)](https://www.npmjs.com/package/@commonsswarm/evmcrispr) [![docs](https://github.com/commonsswarm/evmcrispr/actions/workflows/docs.yml/badge.svg)](https://commonsswarm.github.io/EVMcrispr/)

**_EVMcrispr is still in active development and its API might change until it reaches 1.0._**

A TypeScript library for Aragon-based DAOs that allows you to encode a series of actions into an EVM script that can be sent to forwarder apps.

Actions can be installing apps, granting or revoking permissions, minting tokens, withdrawing funds, etc.

## Documentation

Check out the [documentation](https://commonsswarm.github.io/EVMcrispr/modules.html) for an in-depth explanation of the API.

## Usage

Add the following dependency to your project:

```sh
yarn add @commonsswarm/evmcrispr
```

Import the `EVMcrispr` class:

```js
Import { EVMcrispr } from '@commonsswarm/evmcrispr'
```

To set it up, you'll need to pass to the EVMcrispr an ether's [Signer](https://docs.ethers.io/v5/single-page/#/v5/api/signer/-%23-signers) object and the chain ID the DAO is located in:

```js
const evmcrispr = new EVMcrispr(signer, CHAIN_ID);
```

Connect it to the DAO:

```js
await evmcrispr.connect(DAO_ADDRESS);
```

Create and forward an EVM script:

```js
await evmcrispr.forward(
  [
    evmcrispr.installNewApp("token-manager:membership-tm", [token, false, 0]),
    evmcrispr.installNewApp("voting:membership-voting", [token, suppPct, minQuorumPct, voteTime]),
    evmcrispr.addPermissions([
      [
        evmcrispr.ANY_ENTITY,
        "membership-voting",
        "CREATE_VOTES_ROLE",
      ]
      [
        "membership-voting",
        "membership-tm",
        "MINT_ROLE",
      ],
      [
        "membership-voting",
        "membership-tm",
        "BURN_ROLE",
      ],
    ]),
    evmcrispr.call("membership-tm").mint("0x...", "2000000000000000000"),
  ],
  ["voting:0"]
);
```

## Examples

Below you can find some script examples that use EVMcrispr:

- [Commons Upgrade script](https://github.com/CommonsSwarm/commons-upgrade)

## Contributing

We welcome community contributions!

Please check out our open Issues to get started.
