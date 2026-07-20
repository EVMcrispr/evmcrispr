---
title: "@giveth:project"
---

Resolve a Giveth project slug to its donation recipient address on the current chain.

**Returns**: `address`

## Syntax

```evml
@giveth:project(slug)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `slug` | `giveth-project` | Giveth project slug |

## Examples

```evml
# Print the recipient address of a Giveth project
print "evmcrispr project address:" @giveth:project(evmcrispr)
```

<!-- HAND-WRITTEN -->

## See Also

- [giveth:donate](../commands/donate.md)
- [@giveth:anchor](anchor.md)
