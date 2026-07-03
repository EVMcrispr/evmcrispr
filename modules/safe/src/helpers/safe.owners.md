---
title: "@safe:safe.owners"
---

Return the owner addresses of a Safe.

**Returns**: `array`

## Syntax

```evml
@safe:safe.owners(safe?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load safe

set $owners @safe.owners(0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67)
print $owners
```

## See Also
