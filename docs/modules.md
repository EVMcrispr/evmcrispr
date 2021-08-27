[@commonsswarm/evmcrispr](README.md) / Exports

# @commonsswarm/evmcrispr

## Table of contents

### Main Classes

- [EVMcrispr](classes/EVMcrispr.md)

### Error Classes

- [ErrorException](classes/ErrorException.md)
- [ErrorInvalid](classes/ErrorInvalid.md)
- [ErrorNotFound](classes/ErrorNotFound.md)

### Interfaces

- [Action](interfaces/Action.md)
- [ForwardOptions](interfaces/ForwardOptions.md)

### Main Type aliases

- [ActionFunction](modules.md#actionfunction)
- [Address](modules.md#address)
- [AppCache](modules.md#appcache)
- [AppIdentifier](modules.md#appidentifier)
- [CompletePermission](modules.md#completepermission)
- [Entity](modules.md#entity)
- [Function](modules.md#function)
- [LabeledAppIdentifier](modules.md#labeledappidentifier)
- [Permission](modules.md#permission)
- [RawAction](modules.md#rawaction)

### Error Type aliases

- [ErrorOptions](modules.md#erroroptions)

## Main Type aliases

### ActionFunction

Ƭ **ActionFunction**: () => [`RawAction`](modules.md#rawaction)

#### Type declaration

▸ (): [`RawAction`](modules.md#rawaction)

##### Returns

[`RawAction`](modules.md#rawaction)

#### Defined in

[src/types.ts:116](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L116)

___

### Address

Ƭ **Address**: `string`

A string that contains an Ethereum address.

#### Defined in

[src/types.ts:7](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L7)

___

### AppCache

Ƭ **AppCache**: `Map`<[`AppIdentifier`](modules.md#appidentifier) \| [`LabeledAppIdentifier`](modules.md#labeledappidentifier), `App`\>

A map which contains the DAO's apps indexed by their identifier ([AppIdentifier](modules.md#appidentifier) or [LabeledAppIdentifier](modules.md#labeledappidentifier)).

#### Defined in

[src/types.ts:164](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L164)

___

### AppIdentifier

Ƭ **AppIdentifier**: `string`

A string that follows the format `<AppName>[:<Label>]`:

- **AppName**: Name of the app as it appears in the APM excluding the ens registry name. For example: the
app name of `voting.aragonpm.eth` is `voting`.
- **Label**: Used when more than one app of the same type is installed. It's usually is numeric, starting
from 0 (e.g. agent:2). The user can also define non-numeric labels to identify new installed apps
(e.g. `vault:main-org-reserve`).

#### Defined in

[src/types.ts:129](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L129)

___

### CompletePermission

Ƭ **CompletePermission**: [...Permission, `string`]

An array which follows the format `[<Grantee>, <App>, <Role>, <Manager>]`

- **Grantee**: Entity that will be able to perform the permission.
- **App**: App entity that holds the allowed permission.
- **Role**: The permission's name.
- **Manager**: Entity that will act as the permission manager.

#### Defined in

[src/types.ts:159](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L159)

___

### Entity

Ƭ **Entity**: [`AppIdentifier`](modules.md#appidentifier) \| [`LabeledAppIdentifier`](modules.md#labeledappidentifier) \| [`Address`](modules.md#address)

A string which can be a [AppIdentifier](modules.md#appidentifier), [LabeledAppIdentifier](modules.md#labeledappidentifier) or [Address](modules.md#address).

#### Defined in

[src/types.ts:140](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L140)

___

### Function

Ƭ **Function**<`T`\>: () => `T`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends `any` |

#### Type declaration

▸ (): `T`

##### Returns

`T`

#### Defined in

[src/types.ts:118](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L118)

___

### LabeledAppIdentifier

Ƭ **LabeledAppIdentifier**: `string`

A string that extends [AppIdentifier](modules.md#appidentifier) and it can be used to define non-numeric labels to identify new installed apps
(e.g. `vault:main-org-reserve`).

#### Defined in

[src/types.ts:135](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L135)

___

### Permission

Ƭ **Permission**: [[`Entity`](modules.md#entity), [`Entity`](modules.md#entity), `string`]

An array which follows the format `[<Grantee>, <App>, <Role>]`.

- **Grantee**: Entity that will be able to perform the permission.
- **App**: App entity that holds the allowed permission.
- **Role**: The permission's name.

#### Defined in

[src/types.ts:149](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L149)

___

### RawAction

Ƭ **RawAction**: [`Action`](interfaces/Action.md) \| [`Action`](interfaces/Action.md)[] \| `Promise`<[`Action`](interfaces/Action.md)\>

#### Defined in

[src/types.ts:114](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/types.ts#L114)

___

## Error Type aliases

### ErrorOptions

Ƭ **ErrorOptions**: `Object`

An options object

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `code?` | `string` | The error's code. |
| `name?` | `string` | The error's name. |

#### Defined in

[src/errors.ts:9](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/errors.ts#L9)
