---
title: "@abi.decodeCall"
---

Decode calldata into `[contract signature [args]]` with human-readable EVML values.

**Returns**: `array`

## Syntax

```evml
@abi.decodeCall(contract calldata)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Contract the calldata targets (its verified ABI is used) |
| `calldata` | `bytes` | Full calldata including the 4-byte function selector |

## Examples

```evml
# Decode a token transfer
set [$to $sig $args] @abi.decodeCall(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 0xa9059cbb000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000de0b6b3a7640000)
print $sig
```

<!-- HAND-WRITTEN -->

## See Also

- [@abi.encodeCall](abi.encodeCall.md) — the inverse: encode a call from signature and args
- [@abi.decode](abi.decode.md) — decode raw ABI data given a type list
- [@ens](ens.md) — resolve the `@ens(name)` values back to addresses
