---
title: "safe:remove-guard"
---

Remove the transaction guard of the Safe, or with --module its module guard (Safe v1.5.0 or later).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. This command has no value arguments; it emits the fixed guard removal call chosen by --module.

## Syntax

```evml
safe:remove-guard
```

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--module` | `bool` | Build time | Remove the module guard instead of the transaction guard (Safe v1.5.0 or later, or upgraded by safe:upgrade earlier in the block) |

<!-- HAND-WRITTEN -->

Sets the transaction guard, or with `--module` the module guard, back to
the zero address. `--module` needs Safe v1.5.0 or later, like
[safe:set-guard](set-guard.md).

## Examples

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:execute $mySafe (
  safe:remove-guard
  safe:remove-guard --module true
)
```

## See Also

- [safe:set-guard](set-guard.md)
- [@safe:guard](../helpers/guard.md)
