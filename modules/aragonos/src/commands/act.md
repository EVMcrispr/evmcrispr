---
title: "aragonos:act"
---

Execute an action on a target contract through an agent or vault.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonos:act <agent> <target> <signature> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `agent` | `address` | Build time | Agent or vault forwarder address (build-time protocol discovery) |
| `target` | `address` | Runtime in smart blocks | Target contract address |
| `signature` | `write-abi` | Build time | Function signature to call |
| `[...params]` | `any` | Runtime in smart blocks | Function arguments |

## Examples

```evml
# Execute a contract call through the DAO agent
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  aragonos:act @aragonos:app(agent) @aragonos:app(agent 2) "deposit((uint256,int256),uint256[][])" [1 -2] [[2 3] [4 5]]
)
```

<!-- HAND-WRITTEN -->

## Notes

- The agent must have the necessary permissions to execute the action
- Parameters are ABI-encoded from the function signature, just like `exec`

## See Also

- [exec](../../../std/src/commands/exec.md) — direct contract calls (without DAO agent)
- [forward](forward.md) — route through forwarder apps
