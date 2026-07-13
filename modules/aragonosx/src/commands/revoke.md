---
title: "aragonosx:revoke"
---

Revoke a permission on the DAO or one of its plugins from an entity.

## Syntax

```evml
aragonosx:revoke <who> <where> <permission>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `who` | `address` | Address losing the permission (or ANY_ENTITY) |
| `where` | `plugin` | Target: `dao`, a plugin identifier, or an address |
| `permission` | `permission` | Permission name (e.g. EXECUTE) or bytes32 id |

## Examples

```evml
# Remove an account's permission to execute DAO actions
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose token-voting (
    aragonosx:revoke 0xc125218F4Df091eE40624784caF7F47B9738086f dao EXECUTE
  )
)
```

<!-- HAND-WRITTEN -->

## See Also
