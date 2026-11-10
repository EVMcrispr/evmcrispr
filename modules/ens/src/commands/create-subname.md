---
title: "ens:create-subname"
experimental: true
sidebar:
  label: "ens:create-subname ⚗️"
---

Create a subname under an ENS name you own. Under an ENSv2 name it registers the subname in the name's subregistry, deploying and attaching one first when the name has none.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
ens:create-subname <parent> <label> <owner>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `parent` | `string` | Build time | Parent ENS name (e.g. mydao.eth) |
| `label` | `string` | Build time | Subname label (e.g. vault for vault.mydao.eth) |
| `owner` | `address` | Runtime in smart blocks | Owner of the subname |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--resolver` | `address` | Runtime in smart blocks | Resolver for the subname (defaults to the parent's) |
| `--fuses` | `number` | Build time | Fuses to burn on the subname (wrapped parents only; use @ens:fuses) |
| `--expiry` | `number` | Runtime in smart blocks | Subname expiry timestamp (wrapped and ENSv2 parents; ENSv2 default: a year from now) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Give the treasury its own subname
ens:create-subname mydao.eth treasury 0x1234567890abcdef1234567890abcdef12345678

# Wrapped parent: burn fuses so the subname is out of the parent's control
ens:create-subname mydao.eth vault @me --fuses @ens:fuses("parent-cannot-control" "cannot-unwrap")
```

## Notes

- The subname inherits the parent's resolver unless `--resolver` is passed.
- Under an ENSv2 name the subname is registered in the name's subregistry,
  with the roles a .eth owner gets (set its subregistry and resolver, grant
  them, transfer it). A name without a subregistry gets one first: a
  UserRegistry deployed through ENS's VerifiableFactory, with the sender
  holding every role on it, attached to the name. The sender must be allowed
  to set the name's subregistry (its owner is) and to register in it.
- On ENSv2, `--expiry` defaults to a year from now and is not bound to the
  parent's; `--fuses` does not apply (ENSv2 names have roles instead).
- On ENS v1, `--fuses` and `--expiry` require the parent to be wrapped in the
  NameWrapper.

## See Also

- [@ens:fuses](../helpers/fuses.md) — build a fuse bitmap
- [ens:wrap](wrap.md) — wrap a name
