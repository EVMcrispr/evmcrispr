---
title: "@ens:ens.fuses"
---

Combine NameWrapper fuse names into their uint32 bitmap.

**Returns**: `number`

## Syntax

```evml
@ens:ens.fuses(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `fuse` | First fuse name (e.g. "cannot-unwrap") |
| `[...rest]` | `fuse` | Additional fuse names |

## Examples

```evml
# Burn fuses while creating a subname
set $fuses @ens.fuses("parent-cannot-control" "cannot-unwrap" "cannot-transfer")
print $fuses
```

<!-- HAND-WRITTEN -->

## See Also
