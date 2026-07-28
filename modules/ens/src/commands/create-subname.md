---
title: "ens:create-subname"
experimental: true
---

Create a subname under an ENS name you own.

**Experimental** — requires `VITE_PUBLIC_EXPERIMENTAL=true`.

## Syntax

```evml
ens:create-subname <parent> <label> <owner>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `parent` | `string` | Parent ENS name (e.g. mydao.eth) |
| `label` | `string` | Subname label (e.g. vault for vault.mydao.eth) |
| `owner` | `address` | Owner of the subname |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--resolver` | `address` | Resolver for the subname (defaults to the parent's) |
| `--fuses` | `number` | Fuses to burn on the subname (wrapped parents only; use @ens:fuses) |
| `--expiry` | `number` | Subname expiry timestamp (wrapped parents only) |

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
- `--fuses` and `--expiry` require the parent to be wrapped in the
  NameWrapper.

## See Also

- [@ens:fuses](../helpers/fuses.md) — build a fuse bitmap
- [ens:wrap](wrap.md) — wrap a name
