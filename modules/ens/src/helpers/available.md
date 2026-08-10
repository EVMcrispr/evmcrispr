---
title: "@ens:available"
---

Check whether a .eth name is available for registration.

**On-chain (`@ens:available!`)**: Mainnet only: an assertion reads the chain it runs on, and ENS cannot be reached from another chain.

**Returns**: `bool`

## Syntax

```evml
@ens:available(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | .eth name or label (e.g. vitalik.eth or vitalik) |

## Examples

```evml
# Check availability before registering
set $free @ens:available("mydao.eth")
print $free
```

<!-- HAND-WRITTEN -->

## See Also
