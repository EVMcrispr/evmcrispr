---
title: "load"
---

Load a module. Its commands and helpers become available qualified (`mod:cmd`, `@mod:helper`); an import list makes selected names available unqualified.

## Syntax

```evml
load <moduleName> [imports]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `moduleName` | `module` | Module name (e.g. `aragonos`, `sim`) |
| `[imports]` | `expression` | Import list: `[cmd cmd>renamed @helper @helper>@renamed]` — names usable without the module prefix |

## Examples

```evml
# Load the simulation module
load sim

# Import selected names for unqualified use (barewords = commands, @names = helpers)
load ens [renew @addr]

# Rename an import with >
load ens [set-addr>ens-set-addr @contenthash>@ch]
```

<!-- HAND-WRITTEN -->

## The Import List

After `load <module>`, every export of the module is available in its
qualified form: commands as `<module>:<command>` (e.g. `ens:renew`) and
helpers/constants as `@<module>:<name>` (e.g. `@ens:addr`).

The optional import list makes selected exports usable *without* the module
prefix:

- **Barewords import commands** — `load ens [renew]` lets you write `renew`
  instead of `ens:renew`.
- **`@names` import helpers and constants** — `load ens [@addr]` lets you
  write `@addr(...)` instead of `@ens:addr(...)`.
- **`>` renames an import** — `load aragonos [connect>arConn]` binds the
  command as `arConn`; `load ens [@contenthash>@ch]` binds the helper as
  `@ch`. Renaming only affects the unqualified name: the qualified form keeps
  the original name (`aragonos:connect` works, `aragonos:arConn` does not).

```evml
load sim [fork expect]

# Imported commands work unqualified, including inside blocks
fork --using anvil (
  sim:set-balance @me 1e18
  expect @bool(@token.balance(ETH @me) > 0)
)
```

## Rules

- The import list must be a literal array: `load ens [renew @addr]`.
- Every entry must name an existing export of the module, otherwise the load
  fails (e.g. `module ens has no command named foo`).
- Duplicate imports and imports that collide with an already-imported name or
  a `def`-defined name are errors — use `>` to rename one of them.
- `std` is the prelude: its commands and helpers are always available
  unqualified (they may also be qualified as `std:set`, `@std:token.amount`).

## See Also

- [std:def](def.md) — define your own commands and helpers
