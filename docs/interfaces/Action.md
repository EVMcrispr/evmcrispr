[@commonsswarm/evmcrispr](../README.md) / [Exports](../modules.md) / Action

# Interface: Action

An object that represents an action in the DAO (e.g. installing a new app, minting tokens, etc).

## Table of contents

### Properties

- [data](Action.md#data)
- [to](Action.md#to)
- [value](Action.md#value)

## Properties

### data

• **data**: `string`

The encoded action. It can be conceived of as contract function calls.

#### Defined in

[src/types.ts:27](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L27)

___

### to

• **to**: `string`

The recipient address.

#### Defined in

[src/types.ts:23](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L23)

___

### value

• `Optional` **value**: `BigNumber`

The ether which needs to be sended along with the action (in wei).

#### Defined in

[src/types.ts:31](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L31)
