---
title: "@ens:ens.available"
---

Check whether a .eth name is available for registration.

**Returns**: `bool`

## Syntax

```evml
@ens:ens.available(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | .eth name or label (e.g. vitalik.eth or vitalik) |

## Examples

```evml
# Check availability before registering
set $free @ens.available("mydao.eth")
print $free
```

<!-- HAND-WRITTEN -->

## See Also
