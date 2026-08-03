---
title: "safe:new"
---

Deploy a new Safe (v1.4.1 L2 singleton) with the given owners, at a deterministic address.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

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

safe:new 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 0x44fA8E6f47987339850636F88629646662444217 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb --threshold 2
```

The address is deterministic (CREATE2 over the owners, threshold, and salt),
so the same command deploys the Safe at the same address on any chain. Use
`--salt` to deploy several Safes with the same configuration.

## See Also
