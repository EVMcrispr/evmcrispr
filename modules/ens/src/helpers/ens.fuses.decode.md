---
title: "@ens:ens.fuses.decode"
---

Decode a NameWrapper fuse bitmap into its fuse names.

**Returns**: `array`

## Syntax

```evml
@ens:ens.fuses.decode(fuses)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `fuses` | `number` | uint32 fuse bitmap (e.g. from @ens.fuses.of) |

## Examples

```evml
# Inspect a fuse bitmap
set $names @ens.fuses.decode(65537)
print $names
```

<!-- HAND-WRITTEN -->

## See Also
