---
title: "@aragonosx:plugin"
---

Resolve a plugin identifier to its address within the connected DAO.

**Returns**: `address`

## Syntax

```evml
@aragonosx:plugin(pluginIdentifier)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pluginIdentifier` | `string` | Plugin identifier (e.g. `token-voting`, `multisig:1`), or `_dao:plugin` for cross-DAO lookup |

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
