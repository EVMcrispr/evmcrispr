---
title: "@abi.decode"
---

Decode ABI-encoded bytes into values given a comma-separated type list.

**Returns**: `array`

## Syntax

```evml
@abi.decode(types, data)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `types` | `string` |  |
| `data` | `bytes` | ABI-encoded hex data |

## Examples

```evml
# Decode a single uint256
set $values @abi.decode("uint256" 0x0000000000000000000000000000000000000000000000000000000000000064)
print $values

# Decode multiple types
set $values @abi.decode("uint256,address" 0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000044fa8e6f47987339850636f88629646662444217)
print $values
```

<!-- HAND-WRITTEN -->

## See Also

- [@abi.encodeCall](abi.encodeCall.md) — ABI-encode a function call
- [@abi.encodePacked](abi.encodePacked.md) — packed encoding
