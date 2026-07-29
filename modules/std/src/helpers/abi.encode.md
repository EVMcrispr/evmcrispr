---
title: "@abi.encode"
---

ABI-encode values given a comma-separated type list, like Solidity abi.encode.

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

## See Also

- [@abi.decode](abi.decode.md) — the inverse: decode ABI-encoded data
- [@abi.encodeCall](abi.encodeCall.md) — encode a full function call (with selector)
- [@abi.encodePacked](abi.encodePacked.md) — packed encoding
