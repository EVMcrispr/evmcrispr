---
title: "access-control:renounce"
---

Renounce a role held by the connected account on an AccessControl contract or an AccessManager.

## Syntax

```evml
access-control:renounce <target> <role>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | AccessControl contract or AccessManager address |
| `role` | `number \| string` | Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

access-control:renounce $token MINTER_ROLE
access-control:renounce $manager 42
```

## Notes

- Renounces a role held by the connected account itself; the v5
  `renounceRole` self-confirmation argument is filled in automatically.

## See Also

- [access-control:revoke](revoke.md) — remove someone else's role
