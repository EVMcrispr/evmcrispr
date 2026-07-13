---
title: "aragonosx:grant"
---

Grant a permission on the DAO or one of its plugins to an entity, optionally gated by a condition contract.

## Syntax

```evml
aragonosx:grant <who> <where> <permission>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `who` | `address` | Address receiving the permission (or ANY_ENTITY) |
| `where` | `plugin` | Target: `dao`, a plugin identifier, or an address |
| `permission` | `permission` | Permission name (e.g. EXECUTE) or bytes32 id |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--condition` | `address` | PermissionCondition contract gating the permission |

## Examples

```evml
# Allow an address to create token-voting proposals
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose multisig --approve true (
    aragonosx:grant 0xc125218F4Df091eE40624784caF7F47B9738086f token-voting CREATE_PROPOSAL
  )
)
```

<!-- HAND-WRITTEN -->

## See Also
