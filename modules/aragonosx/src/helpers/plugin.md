---
title: "@aragonosx:plugin"
---

Resolve a plugin repo subdomain to its address within the connected DAO.

**Returns**: `address`

## Syntax

```evml
@aragonosx:plugin(pluginName index?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pluginName` | `string` | Plugin repo subdomain (e.g. `token-voting`, `multisig`) |
| `[index]` | `number` | Instance index when multiple plugins share a subdomain (0 = first) |

## Examples

```evml
# Resolve the token-voting plugin address
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  set $votingPlugin @aragonosx:plugin("token-voting")
  print $votingPlugin
)
```

<!-- HAND-WRITTEN -->

## See Also
