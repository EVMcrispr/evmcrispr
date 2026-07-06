---
title: "safe:add-owner"
---

Add an owner to the Safe, optionally updating the threshold (keeps the current one by default).

## Syntax

```evml
safe:add-owner <owner>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `owner` | `address` | New owner address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--threshold` | `number` | New signature threshold (defaults to the current one) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose $mySafe (
  safe:add-owner 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 --threshold 2
)
```

## See Also
