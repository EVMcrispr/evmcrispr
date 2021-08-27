[@commonsswarm/evmcrispr](../README.md) / [Exports](../modules.md) / EVMcrispr

# Class: EVMcrispr

The default main EVMcrispr class that expose all the functionalities.

## Table of contents

### Constructors

- [constructor](EVMcrispr.md#constructor)

### Properties

- [ANY\_ENTITY](EVMcrispr.md#any_entity)
- [NO\_ENTITY](EVMcrispr.md#no_entity)
- [connector](EVMcrispr.md#connector)

### Methods

- [addPermission](EVMcrispr.md#addpermission)
- [addPermissions](EVMcrispr.md#addpermissions)
- [app](EVMcrispr.md#app)
- [appCache](EVMcrispr.md#appcache)
- [call](EVMcrispr.md#call)
- [connect](EVMcrispr.md#connect)
- [encode](EVMcrispr.md#encode)
- [forward](EVMcrispr.md#forward)
- [installNewApp](EVMcrispr.md#installnewapp)
- [revokePermission](EVMcrispr.md#revokepermission)
- [revokePermissions](EVMcrispr.md#revokepermissions)

## Constructors

### constructor

• **new EVMcrispr**(`signer`, `chainId`)

Create a new EVMcrispr instance.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `signer` | `Signer` | The signer  used to connect to Ethereum and sign any transaction needed. |
| `chainId` | `number` | The id of the network to connect to. |

#### Defined in

[src/EVMcrispr.ts:67](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L67)

## Properties

### ANY\_ENTITY

• **ANY\_ENTITY**: `string`

An address used for permission operations that denotes any type of Ethereum account.

#### Defined in

[src/EVMcrispr.ts:55](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L55)

___

### NO\_ENTITY

• **NO\_ENTITY**: `string`

An address used for permission operations that denotes no Ethereum account.

#### Defined in

[src/EVMcrispr.ts:60](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L60)

___

### connector

• `Readonly` **connector**: `default`

The connector used to fetch Aragon apps.

#### Defined in

[src/EVMcrispr.ts:46](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L46)

## Methods

### addPermission

▸ **addPermission**(`permission`, `defaultPermissionManager`): [`ActionFunction`](../modules.md#actionfunction)

Encode an action that creates a new app permission.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `permission` | [`Permission`](../modules.md#permission) | The permission to create. |
| `defaultPermissionManager` | `string` | The [entity](../modules.md#entity) to set as the permission manager. |

#### Returns

[`ActionFunction`](../modules.md#actionfunction)

A function that returns the permission action.

#### Defined in

[src/EVMcrispr.ts:301](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L301)

___

### addPermissions

▸ **addPermissions**(`permissions`, `defaultPermissionManager`): [`ActionFunction`](../modules.md#actionfunction)

Encode a set of actions that create new app permissions.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `permissions` | [`Permission`](../modules.md#permission)[] | The permissions to create. |
| `defaultPermissionManager` | `string` | The [entity](../modules.md#entity) to set as the permission manager of every permission created. |

#### Returns

[`ActionFunction`](../modules.md#actionfunction)

A function that returns an array of permission actions.

#### Defined in

[src/EVMcrispr.ts:344](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L344)

___

### app

▸ **app**(`appIdentifier`): [`Function`](../modules.md#function)<`string`\>

Fetch the address of an existing or counterfactual app.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `appIdentifier` | `string` | The [identifier](../modules.md#appidentifier) of the app to fetch. |

#### Returns

[`Function`](../modules.md#function)<`string`\>

The app's contract address.

#### Defined in

[src/EVMcrispr.ts:127](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L127)

___

### appCache

▸ **appCache**(): [`AppCache`](../modules.md#appcache)

#### Returns

[`AppCache`](../modules.md#appcache)

The cache that contains all the DAO's apps.

#### Defined in

[src/EVMcrispr.ts:90](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L90)

___

### call

▸ **call**(`appIdentifier`): `any`

Encode an action that calls an app's contract function.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `appIdentifier` | `string` | The [identifier](../modules.md#appidentifier) of the app to call to. |

#### Returns

`any`

A proxy of the app that intercepts contract function calls and returns
the encoded call instead.

#### Defined in

[src/EVMcrispr.ts:100](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L100)

___

### connect

▸ **connect**(`daoAddress`): `Promise`<`void`\>

Connect to a DAO by fetching and caching all its apps and permissions data.
It is necessary to connect to a DAO before doing anything else.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `daoAddress` | `string` | The address of the DAO to connect to. |

#### Returns

`Promise`<`void`\>

#### Defined in

[src/EVMcrispr.ts:80](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L80)

___

### encode

▸ **encode**(`actionFunctions`, `options`): `Promise`<`Object`\>

Encode a set of actions into one using a path of forwarding apps.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `actionFunctions` | [`ActionFunction`](../modules.md#actionfunction)[] | The array of action-returning functions to encode. |
| `options` | [`ForwardOptions`](../interfaces/ForwardOptions.md) | The forward options object. |

#### Returns

`Promise`<`Object`\>

A promise that resolves to an object containing the encoded forwarding action as well as
any pre-transactions that need to be executed.

#### Defined in

[src/EVMcrispr.ts:138](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L138)

___

### forward

▸ **forward**(`actions`, `options`): `Promise`<`TransactionReceipt`\>

Encode a set of actions into one using a path of forwarding apps and send it in a transaction.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `actions` | [`ActionFunction`](../modules.md#actionfunction)[] | The action-returning functions to encode. |
| `options` | [`ForwardOptions`](../interfaces/ForwardOptions.md) | A forward options object. |

#### Returns

`Promise`<`TransactionReceipt`\>

A promise that resolves to a receipt of
the sent transaction.

#### Defined in

[src/EVMcrispr.ts:272](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L272)

___

### installNewApp

▸ **installNewApp**(`identifier`, `initParams?`): [`ActionFunction`](../modules.md#actionfunction)

Encode an action that installs a new app.

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `identifier` | `string` | `undefined` | [Identifier](../modules.md#labeledappidentifier) of the app to install. |
| `initParams` | `any`[] | `[]` | Parameters to initialize the app. |

#### Returns

[`ActionFunction`](../modules.md#actionfunction)

A function which returns a promise that resolves to the installation action.

#### Defined in

[src/EVMcrispr.ts:208](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L208)

___

### revokePermission

▸ **revokePermission**(`permission`, `removeManager?`): [`ActionFunction`](../modules.md#actionfunction)

Encode an action that revokes an app permission.

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `permission` | [`Permission`](../modules.md#permission) | `undefined` | The permission to revoke. |
| `removeManager` | `boolean` | `true` | A boolean that indicates whether or not to remove the permission manager. |

#### Returns

[`ActionFunction`](../modules.md#actionfunction)

A function that returns the revoking actions.

#### Defined in

[src/EVMcrispr.ts:354](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L354)

___

### revokePermissions

▸ **revokePermissions**(`permissions`, `removeManager?`): [`ActionFunction`](../modules.md#actionfunction)

Encode a set of actions that revoke an app permission.

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `permissions` | [`Permission`](../modules.md#permission)[] | `undefined` | The permissions to revoke. |
| `removeManager` | `boolean` | `true` | A boolean that indicates wether or not to remove the permission manager. |

#### Returns

[`ActionFunction`](../modules.md#actionfunction)

A function that returns the revoking actions.

#### Defined in

[src/EVMcrispr.ts:388](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/EVMcrispr.ts#L388)
