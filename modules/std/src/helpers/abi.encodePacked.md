---
title: "@abi.encodePacked"
---

ABI non-standard packed encoding, matching Solidity's abi.encodePacked.

**Returns**: `bytes`

## Syntax

```evml
@abi.encodePacked(types ...values)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `types` | `string` | Comma-separated Solidity types (e.g. "address,uint256") |
| `[...values]` | `any` | Values to encode, one per type |

## Examples

```evml
# Pack an address and amount
set $packed @abi.encodePacked("address,uint256" @me 1e18)
print $packed
```

<!-- HAND-WRITTEN -->

## On-chain face (@abi.encodePacked!)

Packed encoding is pure composition over byte concatenation, so the face
is one `concat` call: constants encode at composition time and merge into
single hex runs, each live word value is cut to its packed width through
one slice (an `address` to its 20 bytes, a `uint64` to 8, a full-width
word passes whole), and a live `string`/`bytes` value contributes its
decoded payload raw. The type list, array and tuple values must be
constants, and at most 4 values may be live — each live part past the
first is re-resolved by every later offset. All-constant calls fold to
the plain face's exact bytes at composition.

## See Also

- [@abi.encode](abi.encode.md) — standard ABI encoding
- [@abi.encodeCall](abi.encodeCall.md) — ABI-encode a function call
- [@abi.decode](abi.decode.md) — decode ABI-encoded data
