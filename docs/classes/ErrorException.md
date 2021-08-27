[@commonsswarm/evmcrispr](../README.md) / [Exports](../modules.md) / ErrorException

# Class: ErrorException

A general error that denotes something unexpected happened.

## Hierarchy

- `Error`

  ↳ **`ErrorException`**

  ↳↳ [`ErrorInvalid`](ErrorInvalid.md)

  ↳↳ [`ErrorNotFound`](ErrorNotFound.md)

## Table of contents

### Constructors

- [constructor](ErrorException.md#constructor)

### Properties

- [message](ErrorException.md#message)
- [name](ErrorException.md#name)
- [stack](ErrorException.md#stack)
- [stackTraceLimit](ErrorException.md#stacktracelimit)

### Methods

- [captureStackTrace](ErrorException.md#capturestacktrace)
- [prepareStackTrace](ErrorException.md#preparestacktrace)

## Constructors

### constructor

• **new ErrorException**(`message?`, `options?`)

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `message` | `string` | `"An unexpected error happened."` |
| `options` | [`ErrorOptions`](../modules.md#erroroptions) | `{}` |

#### Overrides

Error.constructor

#### Defined in

[src/errors.ts:25](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/errors.ts#L25)

## Properties

### message

• **message**: `string`

#### Inherited from

Error.message

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:974

___

### name

• **name**: `string`

#### Inherited from

Error.name

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:973

___

### stack

• `Optional` **stack**: `string`

#### Inherited from

Error.stack

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:975

___

### stackTraceLimit

▪ `Static` **stackTraceLimit**: `number`

#### Inherited from

Error.stackTraceLimit

#### Defined in

node_modules/@types/node/globals.d.ts:13

## Methods

### captureStackTrace

▸ `Static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Create .stack property on a target object

#### Parameters

| Name | Type |
| :------ | :------ |
| `targetObject` | `object` |
| `constructorOpt?` | `Function` |

#### Returns

`void`

#### Inherited from

Error.captureStackTrace

#### Defined in

node_modules/@types/node/globals.d.ts:4

___

### prepareStackTrace

▸ `Static` `Optional` **prepareStackTrace**(`err`, `stackTraces`): `any`

Optional override for formatting stack traces

**`see`** https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Parameters

| Name | Type |
| :------ | :------ |
| `err` | `Error` |
| `stackTraces` | `CallSite`[] |

#### Returns

`any`

#### Inherited from

Error.prepareStackTrace

#### Defined in

node_modules/@types/node/globals.d.ts:11
