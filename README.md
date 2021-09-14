# EVMcrispr

[![](https://img.shields.io/github/package-json/v/commonsswarm/evmcrispr?label=npm)](https://www.npmjs.com/package/@commonsswarm/evmcrispr) [![docs](https://github.com/commonsswarm/evmcrispr/actions/workflows/docs.yml/badge.svg)](https://commonsswarm.github.io/EVMcrispr/)

**_EVMcrispr is still in active development and its API might change until it reaches 1.0._**

A TypeScript library for Aragon-based DAOs that allows you to encode a series of actions into an EVM script that can be sent to [forwarder apps](https://hack.aragon.org/docs/forwarding-intro).

Actions can be thought of as events performed by some entity inside a DAO such as installing apps, granting or revoking permissions, minting tokens, withdrawing funds, etc.

## Documentation

Check out the [documentation](https://commonsswarm.github.io/EVMcrispr/modules.html) for an in-depth explanation of the API.

## How does it work?

EVMcrispr offers two main methods to create EVM scripts containing actions: `encode()` and `forward()` (this one encodes the actions and forwards it afterwards).

Both methods receive two parameters: a group of the encoded actions and a group of forwarder apps used to forward the aforementioned actions.

The library exposes a series of methods that allows you to encode different actions such as installing an app, revoking a permission, etc. The idea is to invoke this methods inside an `encode()` or `forward()` to build the script. Here is an example of it:

```js
await evmcrispr.forward(
  [
    evmcrispr.installNewApp(app, params),
    evmcrispr.addPermissions([permission1, permission2, permission3]),
    evmcrispr.revokePermission(permission, removeManager),
    // ...
  ],
  // forwarder apps path.
  [forwarder1, forwarder2]
);
```

To facilitate the EVM script creation, you can use [identifiers](https://commonsswarm.github.io/EVMcrispr/modules.html#AppIdentifier) to reference DAO apps instead of using the contract address directly.

Below you can find a full example:

```js
await evmcrispr.forward(
  [
    evmcrispr.installNewApp("wrapped-hooked-token-manager.open:membership-tm", [token, false, 0]),
    evmcrispr.installNewApp("voting:membership-voting", [token, suppPct, minQuorumPct, voteTime]),
    evmcrispr.addPermissions([
      [
        evmcrispr.ANY_ENTITY,
        "voting:membership-voting",
        "CREATE_VOTES_ROLE",
      ]
      [
        "voting:membership-voting",
        "wrapped-hooked-token-manager.open:membership-tm",
        "MINT_ROLE",
      ],
      [
        "voting:membership-voting",
        "wrapped-hooked-token-manager.open:membership-tm",
        "BURN_ROLE",
      ],
    ]),
    evmcrispr.call("wrapped-hooked-token-manager.open:membership-tm").mint("0x...", "2e18"),
  ],
  ["token-manager:1", "voting"]
);
```

## Set up

1. Add the following dependency to your project:

   ```sh
   yarn add @commonsswarm/evmcrispr
   ```

2. Import the `EVMcrispr` class:

   ```js
   Import { EVMcrispr } from '@commonsswarm/evmcrispr'
   ```

3. Create a new `EVMcrispr` by using the static method `crate()`. It receives an ether's [Signer](https://docs.ethers.io/v5/single-page/#/v5/api/signer/-%23-signers) object and the DAO address to connect to:

   ```js
   const evmcrispr = await EVMcrispr.create(signer, daoAddress);
   ```

## Other examples

Below you can find some script examples that use EVMcrispr:

- [Commons Upgrade script](https://github.com/CommonsSwarm/commons-upgrade)
- [App installation script](https://gist.github.com/PJColombo/4d4536b87fbae6beece427f0d7de8bb9)

## Contributing

We welcome community contributions!

Please check out our open Issues to get started.
