---
title: "acl:execute-scheduled"
---

Execute an operation through an AccessManager, consuming its schedule when the operation was delayed.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
acl:execute-scheduled <manager> <target> <signature> [...params]
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
