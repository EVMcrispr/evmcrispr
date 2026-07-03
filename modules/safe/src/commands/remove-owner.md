---
title: "safe:remove-owner"
---

Remove an owner from the Safe, lowering the threshold if it would exceed the remaining owners.

## Syntax

```evml
safe:remove-owner <owner>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `owner` | `address` | Owner address to remove |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--threshold` | `number` | New signature threshold (defaults to the current one, capped at the remaining owner count) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load safe

safe:propose $mySafe (
  safe:remove-owner 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6
)
```

The linked-list predecessor required by the Safe contract is resolved
automatically, and the threshold is lowered when it would exceed the number
of remaining owners.

## See Also
