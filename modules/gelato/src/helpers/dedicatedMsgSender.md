---
title: "@gelato:dedicatedMsgSender"
---

The dedicated msg.sender Gelato assigns an account on this chain: the proxy that Web3 Function and --dedicated tasks call targets from, and the operator a VRF consumer is deployed with. Deterministic, so it resolves before the proxy is deployed.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@gelato:dedicatedMsgSender(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Task creator (defaults to the connected account) |

## Examples

```evml
# The address your tasks call from — whitelist it in contracts that restrict callers
set $executor @gelato:dedicatedMsgSender()
```

<!-- HAND-WRITTEN -->

## Notes

- Deterministic (CREATE2 through the OpsProxyFactory), so it resolves before the
  proxy exists; Automate deploys it with your first task.
- Use it as the `operator` when deploying a `GelatoVRFConsumerBase` contract with
  the `contracts` module, and whitelist it in contracts your tasks call.


## See Also
