---
title: "aragonosx:grant"
---

Grant a permission on the DAO or one of its plugins to an entity, optionally gated by a condition contract.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
aragonosx:grant <permission> <on> <where> <to> <who>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `permission` | `permission` | Permission name (e.g. EXECUTE) or bytes32 id |
| `on` | `command` | Keyword `on` |
| `where` | `plugin` | Target: `dao`, a plugin identifier, or an address |
| `to` | `command` | Keyword `to` |
| `who` | `address` | Address receiving the permission (or ANY_ENTITY) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--condition` | `address` | PermissionCondition contract gating the permission |

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
