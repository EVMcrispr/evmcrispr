---
title: "safe:install-scope-guard"
---

Deploy a Zodiac ScopeGuard owned by the Safe and set it as the transaction guard of the Safe, limiting which targets and functions owners can call.

## Syntax

```evml
safe:install-scope-guard
```

## Options

| Name | Type | Description |
|------|------|-------------|
| `--salt` | `number` | Deployment salt nonce (defaults to 0) |

<!-- HAND-WRITTEN -->

## Examples

Restrict what Safe owners can execute:

```evml
load safe

safe:propose $mySafe (
  safe:install-scope-guard
)
```

Deploys a Zodiac ScopeGuard owned by the Safe and sets it as the transaction
guard in one proposal. Until targets are allowed on the guard, it blocks all
owner-initiated transactions — configure it before or right after installing.

## See Also
