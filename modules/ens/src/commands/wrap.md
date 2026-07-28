---
title: "ens:wrap"
experimental: true
---

Wrap an ENS name in the NameWrapper.

**Experimental** — requires `VITE_PUBLIC_EXPERIMENTAL=true`.

## Syntax

```evml
ens:wrap <name>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. mydao.eth) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--resolver` | `address` | Resolver of the wrapped name |
| `--fuses` | `number` | Owner-controlled fuses to burn while wrapping (.eth second-level names only; use @ens:fuses) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Wrap a .eth second-level name (single transaction, no approval needed)
ens:wrap mydao.eth

# Wrap and burn fuses in one go
ens:wrap mydao.eth --fuses @ens:fuses("cannot-unwrap" "cannot-transfer")

# Wrap a subname (approves the NameWrapper, then wraps)
ens:wrap vault.mydao.eth
```

## Notes

- Wrapping a `.eth` second-level name automatically burns
  `parent-cannot-control`.
- `--fuses` only applies to `.eth` second-level names; for subnames burn
  fuses afterwards with `ens:set-fuses`.

## See Also

- [ens:unwrap](unwrap.md) — unwrap a name
- [ens:set-fuses](set-fuses.md) — burn fuses later
