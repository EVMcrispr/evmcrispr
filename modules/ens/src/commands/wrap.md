---
title: "ens:wrap"
experimental: true
sidebar:
  label: "ens:wrap ⚗️"
---

Wrap an ENS name in the NameWrapper.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
ens:wrap <name>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `name` | `string` | Build time | ENS name (e.g. mydao.eth) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--resolver` | `address` | Runtime in smart blocks | Resolver of the wrapped name |
| `--fuses` | `number` | Build time | Owner-controlled fuses to burn while wrapping (.eth second-level names only; use @ens:fuses) |

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
