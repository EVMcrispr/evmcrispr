---
title: "aragonosx:grant"
---

Grant a permission on the DAO or one of its plugins to an entity, optionally gated by a condition contract.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonosx:grant <permission> <on> <where> <to> <who>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `permission` | `permission` | Build time | Permission name (e.g. EXECUTE) or bytes32 id |
| `on` | `command` | Build time | Keyword `on` |
| `where` | `plugin` | Build time | Target: `dao`, a plugin identifier, or an address |
| `to` | `command` | Build time | Keyword `to` |
| `who` | `address` | Runtime in smart blocks | Address receiving the permission (or ANY_ENTITY) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--condition` | `address` | Runtime in smart blocks | PermissionCondition contract gating the permission |

## Examples

```evml
# Allow an address to create token-voting proposals
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose multisig --approve true (
    aragonosx:grant CREATE_PROPOSAL on token-voting to 0xc125218F4Df091eE40624784caF7F47B9738086f
  )
)
```

<!-- HAND-WRITTEN -->

## See Also
