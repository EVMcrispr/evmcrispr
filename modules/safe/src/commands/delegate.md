---
title: "safe:delegate"
---

Add or remove an account that proposes Safe transactions on the Safe Transaction Service on behalf of the connected owner, without confirming them.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
safe:delegate <action> <safe> <delegate>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `action` | `command` | Build time | Keyword `add`, or `remove` (as the owner who added the delegate, or as the delegate itself) |
| `safe` | `address` | Build time | Safe address |
| `delegate` | `address` | Build time | Account that proposes, other than an owner |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--label` | `string` | Build time | Name shown for the delegate (defaults to evmcrispr); add only |
| `--expires` | `number` | Build time | Unix timestamp after which the delegate can no longer propose, e.g. @date(now +30d); add only |

<!-- HAND-WRITTEN -->

## Examples

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
set $bot 0x4444444444444444444444444444444444444444

# Let $bot propose for the connected owner for 30 days.
safe:delegate add $safe $bot --label bot --expires @date(now +30d)

# Remove it again: the owner who added it, or $bot itself (as @me).
safe:delegate remove $safe $bot
```

Proposals by a delegate carry no confirmation: an owner still confirms them.
`--label` and `--expires` apply to `add` only.

## See Also
