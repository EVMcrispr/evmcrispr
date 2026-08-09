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
| `moduleName` | `module` | Module name (e.g. `aragonos`, `sim`); with --from, `name>alias` loads the module under a local alias |
| `[imports]` | `expression` | Import list: `[cmd cmd>renamed @helper @helper>@renamed]` — names usable without the module prefix |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--from` ⚗️ | `string` | ipfs://<cid> of an external EVML module file whose def module name matches the load line (rename with name>alias); for encrypted share links, append the link key and quote: "ipfs://<cid>#<key>" |

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
load token [@decimals]

# Imported commands and helpers work unqualified, including inside blocks
fork --using anvil (
  sim:set-balance @me 1e18
  expect @bool(@decimals(DAI) > 0)
)
```

## External EVML Modules (`--from`)

`load <name> --from ipfs://<cid>` fetches an EVML module file from IPFS. The
file must contain exactly one [`def module`](def.md) command, and the name
it declares must match the name written in the load line — so the load line
always documents which module you are pulling in. Add `>alias` to bind it
under a different local name (e.g. when two libraries picked the same name):

```evml novalidate
load math --from ipfs://QmYourModuleCid
set $x @math:double(21)

# Load under a local alias — the canonical name stays unbound
load math>mylib --from ipfs://QmYourModuleCid

# Import lists work the same as with registered modules
load math --from ipfs://QmYourModuleCid [@double>@dbl]
```

- Only `ipfs://<cid>` (and `"ipfs://<cid>#<key>"`) sources are supported —
  content-addressing pins the exact code you audited, forever.
- The pin must be plain text (publish with the `evmcrispr_publish_module`
  MCP tool or by uploading the file in the terminal) or a share pin whose
  script is a module file. Encrypted share links produced by `create-link`
  need their key appended and the source quoted
  (`--from "ipfs://<cid>#<key>"` — `#` starts a comment outside quotes);
  without the key they are rejected.
- `name>alias` renames are only valid together with `--from` — registered
  module namespaces are never aliased.
- External modules may shadow registered-but-unloaded module names (the
  editor warns; rename with `>alias` to keep both available). This keeps
  published scripts working when future built-in modules take the same
  name. Loading the same local name twice is always an error.
- Module defs run isolated: their `set` bindings are scope-local and they
  cannot read or write `$mod:key` config variables.

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
