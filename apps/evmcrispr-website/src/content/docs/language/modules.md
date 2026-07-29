---
title: Modules & Imports
---

Almost everything in EVMcrispr beyond the core language lives in modules —
packages of commands and helpers for a protocol or a capability.

The `std` module is loaded by default — its commands (`set`, `exec`,
`print`, …) and helpers (`@me`, `@token(...)`, …) never need a prefix.
Load additional modules with:

```evml
load aragonos
load sim
load ens
load http
```

After loading, use their commands and helpers with the module prefix
(`mod:command`, `@mod:helper`):

```evml
load sim
sim:fork (
  sim:set-balance @me 100e18
  exec 0x44fA8E6f47987339850636F88629646662444217 "foo()"
)
```

The [Reference](/reference/std/) section documents every module's commands
and helpers.

## Import Lists

To use module names without the prefix, list them on the `load` line.
Barewords import commands; `@name` entries import helpers:

```evml
load sim [fork set-balance expect]
load aragonos [grant @app]

fork (
  set-balance @me 100e18
  expect @bool(1 == 1)
)
```

The import list is the whole mechanism: an unqualified name resolves to an
in-script `def`, a name imported on a `load` line, or the `std` prelude —
nothing else. Blocks don't change resolution (being inside
`aragonos:connect (...)` does not make bare `grant` mean `aragonos:grant`
unless you imported it), so what a name means is always visible in the
script itself, and a module update can never change it behind your back.

## Renames

Use `>` inside the import list to bind a module name to a different
unqualified name — for example when it would collide with a `std` command
or another import:

```evml
load sim [fork>simulate set-balance]

simulate (
  set-balance @me 100e18
)
```

The qualified form is unaffected: `sim:fork` still works. Helper renames
work the same way: `load aragonos [@app>@aragonApp]` makes the helper
available as `@aragonApp(...)` (and still as `@aragonos:app(...)`).

## Inline Modules

`def module <name> ( ...defs )` groups your own `def`s into a namespace,
used exactly as if the module were loaded:

```evml
def module math (
  def @double "$x: number -> number" @num($x * 2)
)

set $result @math:double(21)
```

Module defs run isolated: their `set` bindings are scope-local and they
cannot read or write config variables.

:::experimental

## External Modules

`load <name> --from ipfs://<cid>` fetches an inline-module file published to
IPFS and loads it like a registered module:

```evml novalidate
load math --from ipfs://QmYourModuleCid
set $x @math:double(21)
```

See [Publishing Modules](../guides/publishing-modules.md) for how to write,
publish, and consume external modules.

:::
