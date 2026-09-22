---
title: "aragonosx:revoke"
---

Revoke a permission on the DAO or one of its plugins from an entity.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonosx:revoke <permission> <on> <where> <from> <who>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `permission` | `permission` | Build time | Permission name (e.g. EXECUTE) or bytes32 id |
| `on` | `command` | Build time | Keyword `on` |
| `where` | `plugin` | Build time | Target: `dao`, a plugin identifier, or an address |
| `from` | `command` | Build time | Keyword `from` |
| `who` | `address` | Runtime in smart blocks | Address losing the permission (or ANY_ENTITY) |

## Examples

```evml
# Remove an account's permission to execute DAO actions
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose token-voting (
    aragonosx:revoke EXECUTE on dao from 0xc125218F4Df091eE40624784caF7F47B9738086f
  )
)
```

<!-- HAND-WRITTEN -->

## See Also
