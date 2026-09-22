---
title: "acl:renounce"
---

Renounce a role held by the connected account on an AccessControl contract or an AccessManager.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:renounce <role> <on> <target>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `role` | `number \| string` | Build time | Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id |
| `on` | `command` | Build time | Keyword `on` |
| `target` | `address` | Runtime in smart blocks | AccessControl contract or AccessManager address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

acl:renounce MINTER_ROLE on $token
acl:renounce 42 on $manager
```

## Notes

- Renounces a role held by the connected account itself; the v5
  `renounceRole` self-confirmation argument is filled in automatically.

## See Also

- [acl:revoke](revoke.md) — remove someone else's role
