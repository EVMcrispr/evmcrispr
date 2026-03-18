---
title: "@giveth:projectAddr"
---

Resolve a Giveth project slug to its contract address.

**Returns**: `address`

## Syntax

```evml
@giveth:projectAddr(slug)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `slug` | `string` | Giveth project slug |

## Examples

```evml
# Resolve a project slug to its address
set $addr @projectAddr("evmcrispr")
print $addr
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:donate](../../commands/donate.md) — donate to a project
