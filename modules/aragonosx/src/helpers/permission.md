---
title: "@aragonosx:permission"
---

Compute the bytes32 id of a permission name (keccak256 of e.g. EXECUTE_PERMISSION).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bytes32`

## Syntax

```evml
@aragonosx:permission(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Permission name (e.g. `EXECUTE`) or bytes32 id |

## Examples

```evml
# Compute a permission id for use in a raw exec call
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  set $id @aragonosx:permission("EXECUTE")
  print $id
)
```

<!-- HAND-WRITTEN -->

## See Also
