---
title: "access-control:execute-scheduled"
---

Execute an operation through an AccessManager, consuming its schedule when the operation was delayed.

## Syntax

```evml
access-control:execute-scheduled <manager> <target> <signature> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `target` | `address` | Managed contract address |
| `signature` | `write-abi` | Function to call on the target |
| `[...params]` | `any` | Arguments matching the signature types |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--value` | `number` | ETH to send with the call (in wei) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

access-control:execute-scheduled $manager $token "setDuration(uint256)" 31536000
```

## Notes

- Also works for calls that need no delay: the AccessManager relays the call
  directly when the caller has immediate permission.
- Consumes the schedule created by [access-control:schedule](schedule.md) when one exists.

## See Also

- [access-control:schedule](schedule.md) — schedule the operation first
- [@access-control.canCall](../helpers/access-control.canCall.md) — check if a delay applies
