---
title: "acl:execute-scheduled"
---

Execute an operation through an AccessManager, consuming its schedule when the operation was delayed.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:execute-scheduled <manager> <target> <signature> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `manager` | `address` | Runtime in smart blocks | AccessManager address |
| `target` | `address` | Runtime in smart blocks | Managed contract address |
| `signature` | `write-abi` | Build time | Function to call on the target |
| `[...params]` | `any` | Runtime in smart blocks | Arguments matching the signature types |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--value` | `number` | Runtime in smart blocks | ETH to send with the call (in wei) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

acl:execute-scheduled $manager $token "setDuration(uint256)" 1y
```

## Notes

- Also works for calls that need no delay: the AccessManager relays the call
  directly when the caller has immediate permission.
- Consumes the schedule created by [acl:schedule](schedule.md) when one exists.

## See Also

- [acl:schedule](schedule.md) — schedule the operation first
- [@acl:canCall](../helpers/canCall.md) — check if a delay applies
