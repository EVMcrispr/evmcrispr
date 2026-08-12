---
title: "@bytes32"
---

Pad a value to a 32-byte hex string. Integers and arithmetic expressions are left-padded like Solidity's `bytes32(uint256(...))` cast; hex strings pad left by default or right with a trailing `right`.

**Returns**: `bytes32`

## Syntax

```evml
@bytes32(...tokens)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...tokens]` | `any` | Value or arithmetic expression, optionally followed by a `left`/`right` padding direction (hex strings only) |

## Examples

```evml
# Derive the ERC-1967 admin slot
set $slot @bytes32(@hash("eip1967.proxy.admin") - 1)

# Right-pad a short hex value
set $b @bytes32(0x01 right)
```

<!-- HAND-WRITTEN -->

## See Also
