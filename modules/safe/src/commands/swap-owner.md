---
title: "safe:swap-owner"
---

Replace an owner of the Safe with a new address.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
safe:swap-owner <oldOwner> <for> <newOwner>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `oldOwner` | `address` | Build time | Owner to replace |
| `for` | `command` | Build time | Keyword `for` |
| `newOwner` | `address` | Runtime in smart blocks | New owner address |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also
