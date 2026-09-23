---
title: "safe:new"
---

Deploy a new Safe (v1.5.0 L2 singleton) with the given owners, at a deterministic address.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. Owners, threshold and salt determine the predicted Safe address.

## Syntax

```evml
safe:new [...owners]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `[...owners]` | `address` | Build time | Owner addresses |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--threshold` | `number` | Build time | Signature threshold (defaults to 1) |
| `--salt` | `number` | Build time | Deployment salt nonce (defaults to 0) |

<!-- HAND-WRITTEN -->

## Examples

Deploy a 2-of-3 Safe:

```evml
load safe

safe:new 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 0x44fA8E6f47987339850636F88629646662444217 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb --threshold 2
```

Choose a custom deployment nonce and predict a single-owner Safe:

```evml
load safe

set $owner 0x1111111111111111111111111111111111111111
set $salt 42
set $safe @safe:address($owner $salt)
safe:new $owner --salt $salt
```

The address is deterministic (CREATE2 over the deployment profile, owners,
threshold, and salt). The same configuration gives the same address on chains
using the same factory, singleton, and fallback handler. Use `--salt` to deploy
several Safes with the same configuration. The salt defaults to 0 and is not
the Safe's transaction nonce. Repeating a deployed configuration and salt
reverts; this command always prepares a deployment.

On chains the canonical Safe contracts never reached (the EEZ devnet), the
module uses its own deployment of the same v1.4.1 bytecode through the
Arachnid CREATE2 deployer, at the same addresses on every such chain, so a
Safe created there has a different address than on a canonical chain. Run
`scripts/deploy-create2.ts` to bring the contracts to another such chain.

## See Also

- [@safe:address](../helpers/address.md)
