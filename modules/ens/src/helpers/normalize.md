---
title: "@ens:normalize"
---

Normalize an ENS name per ENSIP-15.

**Returns**: `string`

## Syntax

```evml
@ens:normalize(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name to normalize |

## Examples

```evml
# Normalize a mixed-case name
set $name @ens:normalize("MyDAO.eth")
print $name
```

<!-- HAND-WRITTEN -->

## See Also
