---
title: "@abi.encodePacked"
---

ABI non-standard packed encoding, matching Solidity

**Returns**: `bytes`

## Syntax

```evml
@abi.encodePacked(types, ...values)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `types` | `string` |  |
| `[...values]` | `any` | Values to encode, one per type |

## Examples

```evml
# Pack an address and amount
set $packed @abi.encodePacked("address,uint256" @me 1e18)
print $packed
```

<!-- HAND-WRITTEN -->

## See Also

- [@abi.encodeCall](abi.encodeCall.md) — ABI-encode a function call
- [@abi.decode](abi.decode.md) — decode ABI-encoded data
