---
title: Publishing Modules
experimental: true
---

You can package reusable commands and helpers as an **external module**: an
EVML file published to IPFS that anyone can pull into their script with a
single `load` line. No TypeScript, no pull request — external modules are
written in EVML itself.

## Writing a Module File

A module file contains exactly one `def module <name> ( ... )` command whose
block contains only `def`s:

```evml
def module math (
  def @double "$x: number -> number" @num($x * 2)

  def sendDouble "$token: address $to: address $amount: number" (
    exec $token "transfer(address,uint256)" $to @math:double($amount)
  )
)
```

Module defs run isolated: their `set` bindings are scope-local, they cannot
read or write `$mod:key` config variables, and nested `def module`s are not
allowed.

## Publishing

Two ways to pin the file to IPFS as plain text:

- **Terminal** — upload the module file in the
  [terminal](https://next.evmcrispr.com) (drag it into the editor); the
  file is pinned as-is.
- **MCP** — assistants connected to the [MCP server](mcp.md) can call the
  `publish-module` tool, which validates the file and returns the ready
  `load <name> --from ipfs://<cid>` line.

Because IPFS is content-addressed, the CID permanently identifies the exact
code you published — consumers audit it once and it can never change behind
their back. Publishing a new version means publishing a new CID.

## Loading an External Module

```evml novalidate
load math --from ipfs://QmYourModuleCid
set $x @math:double(21)
```

The name on the `load` line must match the name the file declares — the
load line always documents which module you are pulling in. Import lists
and renames work the same as with registered modules:

```evml novalidate
# Load under a local alias — e.g. when two libraries picked the same name
load math>mylib --from ipfs://QmYourModuleCid

# Import selected names for unqualified use
load math --from ipfs://QmYourModuleCid [@double>@dbl]
```

Rules to be aware of:

- Only `ipfs://<cid>` sources are supported — content-addressing pins the
  exact code you audited, forever.
- `name>alias` renames are only valid together with `--from` — registered
  module namespaces are never aliased.
- External modules may shadow registered-but-unloaded module names (the
  editor warns; rename with `>alias` to keep both available). This keeps
  published scripts working when future built-in modules take the same name.

## Encrypted Module Links

[Share links](sharing-scripts.md) whose script is a module file also work
as module sources. Their pins are encrypted, so the link's key must be
appended to the CID and the whole source quoted — outside quotes, `#`
starts a comment:

```evml novalidate
load math --from "ipfs://QmYourModuleCid#theLinkKey"
```

Without the key, encrypted pins are rejected. Use this when a module should
only be loadable by people you shared the link with; use plain publishing
for anything meant to be public.

## Next Steps

- [Modules & Imports](../language/modules.md) — how `load`, import lists, and renames work
- [Writing a Module](../contribute/writing-a-module.md) — TypeScript modules that ship with EVMcrispr itself
