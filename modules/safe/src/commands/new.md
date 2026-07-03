---
title: "safe:new"
---

Deploy a new Safe (v1.4.1 L2 singleton) with the given owners, at a deterministic address.

## Syntax

```evml
safe:new [...owners]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...owners]` | `address` | Owner addresses |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--threshold` | `number` | Signature threshold (defaults to 1) |
| `--salt` | `number` | Deployment salt nonce (defaults to 0) |

<!-- HAND-WRITTEN -->

## Examples

Deploy a 2-of-3 Safe:

```evml
load safe

safe:new 0x6E3bcx... 0x8F94... 0xB3c1... --threshold 2
```

The address is deterministic (CREATE2 over the owners, threshold, and salt),
so the same command deploys the Safe at the same address on any chain. Use
`--salt` to deploy several Safes with the same configuration.

## See Also
