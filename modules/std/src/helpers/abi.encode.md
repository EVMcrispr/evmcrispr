---
title: "@abi.encode"
---

ABI-encode values given a comma-separated type list, like Solidity abi.encode.

**On-chain (`@abi.encode!`)**: Live values must be elementary static types, at most 4 per call; dynamic, array and tuple types only encode when every value is constant.

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

Standard encoding of static types is their 32-byte head words
concatenated, so the face is one `concat` over full-width word parts —
constants fold into hex runs, live words splice in place. Dynamic types
(`string`, `bytes`, arrays, tuples) re-encode through offsets, which is
the recursive re-encoder the core deliberately lacks: a call containing
one refuses unless every value is constant, in which case the whole call
folds at composition. For raw byte-appending of live dynamic values, use
`@abi.encodePacked!`.

## See Also

- [@abi.decode](abi.decode.md) — the inverse: decode ABI-encoded data
- [@abi.encodeCall](abi.encodeCall.md) — encode a full function call (with selector)
- [@abi.encodePacked](abi.encodePacked.md) — packed encoding
