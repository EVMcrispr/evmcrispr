[@commonsswarm/evmcrispr](../README.md) / [Exports](../modules.md) / ErrorInvalid

# Class: ErrorInvalid

The resource doesn’t seem to be valid.

## Hierarchy

- [`ErrorException`](ErrorException.md)

  ↳ **`ErrorInvalid`**

## Table of contents

### Constructors

- [constructor](ErrorInvalid.md#constructor)

### Properties

- [message](ErrorInvalid.md#message)
- [name](ErrorInvalid.md#name)
- [stack](ErrorInvalid.md#stack)
- [stackTraceLimit](ErrorInvalid.md#stacktracelimit)

### Methods

- [captureStackTrace](ErrorInvalid.md#capturestacktrace)
- [prepareStackTrace](ErrorInvalid.md#preparestacktrace)

## Constructors

### constructor

• **new ErrorInvalid**(`message?`, `__namedParameters?`)

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `message` | `string` | `"The resource doesn’t seem to be valid."` |
| `__namedParameters` | [`ErrorOptions`](../modules.md#erroroptions) | `{}` |

#### Overrides

[ErrorException](ErrorException.md).[constructor](ErrorException.md#constructor)

#### Defined in

[src/errors.ts:39](https://github.com/CommonsSwarm/EVMcrispr/blob/652215b/src/errors.ts#L39)

## Properties

### message

• **message**: `string`

#### Inherited from

[ErrorException](ErrorException.md).[message](ErrorException.md#message)

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:974

___

### name

• **name**: `string`

#### Inherited from

[ErrorException](ErrorException.md).[name](ErrorException.md#name)

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:973

___

### stack

• `Optional` **stack**: `string`

#### Inherited from

[ErrorException](ErrorException.md).[stack](ErrorException.md#stack)

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:975

___

### stackTraceLimit

▪ `Static` **stackTraceLimit**: `number`

#### Inherited from

[ErrorException](ErrorException.md).[stackTraceLimit](ErrorException.md#stacktracelimit)

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

[ErrorException](ErrorException.md).[captureStackTrace](ErrorException.md#capturestacktrace)

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

[ErrorException](ErrorException.md).[prepareStackTrace](ErrorException.md#preparestacktrace)

#### Defined in

node_modules/@types/node/globals.d.ts:11
