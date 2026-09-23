---
title: "@safe:address"
---

Predict the single-owner Safe address for safe:new with a deployment salt nonce, without RPC access.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@safe:address(owner salt?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `owner` | `address` | Initial sole owner (threshold 1) |
| `[salt]` | `number` | Deployment salt nonce, matching safe:new --salt (defaults to 0) |

<!-- HAND-WRITTEN -->

## Examples

Predict a single-owner Safe, then deploy it with the same salt nonce:

```evml
load safe

set $owner 0x1111111111111111111111111111111111111111
set $salt 42
set $safe @safe:address($owner $salt)
safe:new $owner --salt $salt
```

Omitting the salt is equivalent to `0`, the default for `safe:new`:

```evml
load safe
print @safe:address(@sender)
```

The owner is explicit: use the timelock for a Governor with a timelock,
the final executing forwarder for Aragon OS, the DAO for Aragon OSx, or
the destination proxy representing the source caller for EEZ. Inside a
routed block, `@sender` supplies that block's execution account.

## Deployment configuration

This helper predicts `safe:new owner --salt salt` with one owner and
threshold 1. It uses the same Safe 1.5.0 L2 singleton, factory,
compatibility fallback handler, and proxy creation code as the command.
It does not predict deployments with multiple owners or another threshold.

The salt is a uint256 deployment value, **not** the Safe's transaction nonce
returned by `@safe:nonce`. Changing the owner or salt changes the predicted
address. Chains using the same deployment profile give the same address;
EEZ's alternate factory, singleton and handler produce a different address.

Prediction requires no RPC access and works inside batches and proposals.
It does not deploy the Safe, check whether it exists, discover an official
DAO treasury, or verify current ownership. Owners and threshold may change
after deployment without changing this address.

## See Also

- [safe:new](../commands/new.md)
- [@safe:owners](owners.md)
- [@safe:nonce](nonce.md)
