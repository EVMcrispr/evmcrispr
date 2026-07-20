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

## See Also

- [@abi.encode](abi.encode.md) — standard ABI encoding
- [@abi.encodeCall](abi.encodeCall.md) — ABI-encode a function call
- [@abi.decode](abi.decode.md) — decode ABI-encoded data
