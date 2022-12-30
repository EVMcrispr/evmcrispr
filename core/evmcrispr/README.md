# EVMcrispr

[![](https://img.shields.io/npm/v/@1hive/evmcrispr.svg?logo=npm)](https://www.npmjs.com/package/@1hive/evmcrispr)
[![Coverage Status](https://img.shields.io/coveralls/github/1Hive/evmcrispr?logo=coveralls&branch=master)](https://coveralls.io/github/1Hive/evmcrispr?branch=master) [![Typedocs](https://github.com/1hive/evmcrispr/actions/workflows/docs.yml/badge.svg)](https://1hive.github.io/evmcrispr/)

**_EVMcrispr is still in active development and its API might change until it reaches 1.0._**

A TypeScript library for Aragon-based DAOs that allows you to encode a series of actions into an EVM script that can be sent to [forwarder apps](https://hack.aragon.org/docs/forwarding-intro).

Actions can be thought of as events performed by some entity inside a DAO such as installing apps, granting or revoking permissions, minting tokens, withdrawing funds, etc.

## API Documentation

Check out these [docs](https://1hive.github.io/evmcrispr/) for an in-depth explanation of the API.

## How does it work?

EVMcrispr offers two main methods to create EVM scripts containing actions: `encode()` and `forward()` (this one encodes the actions and forwards it afterwards).

Both methods receive two parameters: a group of the encoded actions and a group of forwarder apps used to forward the aforementioned actions.

The library exposes a series of methods that allows you to encode different actions such as installing an app, revoking a permission, etc. The idea is to invoke these methods inside an `encode()` or `forward()` to build the script. Here is an example of it:

```js
const evmcrispr = EVMcrispr(dao, signer);
await evmcrispr.forward(
  [
    evmcrispr.install(app, params),
    evmcrispr.grantPermissions([permission1, permission2, permission3]),
    evmcrispr.revoke(permission, removeManager),
    // ...
  ],
  // forwarder apps path.
  [forwarder1, forwarder2],
);
```

The same EVMscript can be encoded using the `evmcl` template:

```js
await evmcl`
  connect ${dao} ${forwarder1} ${forwarder2}
  install ${app} ${param1} ${param2}
  grant ${entity1} ${app1} ${role1} ${permissionManager}
  grant ${entity2} ${app2} ${role1} ${permissionManager}
  grant ${entity3} ${app3} ${role3} ${permissionManager}
  revoke ${entity4} ${app4} ${role4} ${removeManager}
  # ...
`.forward(signer);
```

To facilitate the EVM script creation, you can use [identifiers](https://1hive.github.io/EVMcrispr/modules.html#AppIdentifier) to reference DAO apps instead of using the contract address directly.

The available commands are:

```
connect <dao> <...path> [--context:https://yoursite.com]
new token <name> <symbol> <controller> [decimals=18] [transferable=true]
install <repo> [...initParams]
upgrade <apmRepo> <contract>
grant <entity> <app> <role> [permissionManager]
revoke <entity> <app> <role>
exec <app> <methodName> [...params]
act <agent> <targetAddr> <methodSignature> [...params]
```

Below you can find a full example:

```js
await evmcl`
  connect ${dao} token-manager:1 voting
  install wrapped-hooked-token-manager.open:membership-tm ${token} false 0
  install voting:membership-voting ${token} ${suppPct} ${minQuorumPct} ${voteTime}
  grant ANY_ENTITY voting:membership-voting CREATE_VOTES_ROLE
  grant voting:membership-voting wrapped-hooked-token-manager.open:membership-tm MINT_ROLE
  grant voting:membership-voting wrapped-hooked-token-manager.open:membership-tm BURN_ROLE
  exec wrapped-hooked-token-manager.open:membership-tm mint ${address} 2e18
`.forward(signer);
);
```

## Set up

1. Add the following dependencies to your project:

   ```sh
   yarn add @1hive/evmcrispr ethers
   ```

2. Import the `evmcl` template:

   ```js
   import { evmcl } from '@1hive/evmcrispr';
   ```

3. Fill the evmcl template with the available commands. It receives an ether's [Signer](https://docs.ethers.io/v5/single-page/#/v5/api/signer/-%23-signers) object and the DAO address to connect to:

   ```js
   const evm = evmcl`
    connect 1hive disputable-voting.open
    set $token.tokenlist https://tokens.honeyswap.org/
    act agent @token(HNY) transfer(address,uint256) @me 100e18
    act agent @token(WETH) transfer(address,uint256) @me 1e18
   `;
   ```

4. Use the EVMcrispr's `encode` or `forward` functions to pass an array of actions, or an evmcl script.

   ```js
   const { actions, forward } = await evm.encode(signer);
   await forward();
   // or just
   await evm.forward(signer);
   ```

## Parametric permission utils

The following utils can be used to encode complex [permission parameters](https://hack.aragon.org/docs/aragonos-ref#parameter-interpretation):

- `arg(i)`: Can be used to compare the `i`th parameter with a given value.
- `oracle(address)`: Can be used to check the output of an external contract
- `blocknumber`: Can be used to compare a given value with the block number.
- `timestamp`: Can be used to compare a given value with the block timestamp.
- `not(param)`: Can be used to negate a parameter.
- `and(param1, param2)`: Can be used to compose two parameters with the AND logical function.
- `or(param1, param2)`: Same as previous one with the OR logical function.
- `xor(param1, param2)`: Same as the previous one with the XOR logical function.
- `iif(param).then(param).else(param)`: Ternary operator for more complex logic expressions.

They can be used within the forth parameter of `grant(entity, app, role, params)` function.

## Other examples

Below you can find some script examples that use EVMcrispr:

- [Commons Upgrade script](https://github.com/CommonsSwarm/commons-upgrade)
- [App installation script](https://gist.github.com/PJColombo/4d4536b87fbae6beece427f0d7de8bb9)

## Contributing

We welcome community contributions!

Please check out our open [Issues](https://github.com/1Hive/evmcrispr/issues) to get started.
