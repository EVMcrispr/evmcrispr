---
title: "aragonosx:revoke"
---

Revoke a permission on the DAO or one of its plugins from an entity.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
aragonosx:revoke <permission> <on> <where> <from> <who>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `permission` | `permission` | Permission name (e.g. EXECUTE) or bytes32 id |
| `on` | `command` | Keyword `on` |
| `where` | `plugin` | Target: `dao`, a plugin identifier, or an address |
| `from` | `command` | Keyword `from` |
| `who` | `address` | Address losing the permission (or ANY_ENTITY) |

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
