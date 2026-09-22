---
title: "governor:timelock-cancel"
---

Cancel a pending TimelockController operation. The sender needs the CANCELLER_ROLE.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
governor:timelock-cancel <timelock> <operationId>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `timelock` | `address` | Runtime in smart blocks | TimelockController address |
| `operationId` | `bytes32` | Runtime in smart blocks | Operation id (bound by governor:timelock-schedule) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor

set $timelock 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $grantee 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

governor:timelock-schedule $opId $timelock 2d (
  exec $token transfer(address,uint256) $grantee 100e18
)
governor:timelock-cancel $timelock $opId
```

## Notes

- Requires the CANCELLER_ROLE; only pending (not yet executed) operations
  can be cancelled.

## See Also

- [governor:timelock-schedule](timelock-schedule.md) — binds the operation id
