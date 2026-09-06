---
title: "@abi.encode"
---

ABI-encode values given a comma-separated type list, like Solidity abi.encode.

**On-chain (`@abi.encode!`)**: Encode live ABI values, including tuples and arrays, using a constant type descriptor.

**Returns**: `bytes`

## Syntax

```evml
@abi.encode(types ...values)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `types` | `string` | Comma-separated Solidity types (e.g. `uint256,address`) |
| `[...values]` | `any` | Values to encode, one per type |

## Examples

```evml
# Encode values without a selector
set $data @abi.encode("uint256,address" 100e18 0x44fA8E6f47987339850636F88629646662444217)
print $data
```

<!-- HAND-WRITTEN -->

## On-chain face (@abi.encode!)

The type descriptor is constant. Values can be live scalars, strings, arrays, or
single tuple returns. Operations.encodeBytes reconstructs canonical ABI offsets and rejects malformed nested offsets, lengths, byte padding, and trailing data in live encodings.
Live integer narrowing is checked before encoding; constants are validated recursively.
Convert fractional values explicitly before using integer ABI parameters.
