---
title: "aragonos:act"
---

Execute an action on a target contract through an agent or vault.

## Syntax

```evml
aragonos:act <agent> <target> <signature> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `agent` | `address` | Agent or vault forwarder address |
| `target` | `address` | Target contract address |
| `signature` | `write-abi` | Function signature to call |
| `[...params]` | `any` | Function arguments |

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
