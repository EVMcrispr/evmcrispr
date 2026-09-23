---
title: "@safe:queue"
---

safeTxHashes of the trusted transactions queued on the Safe Transaction Service that can still execute (not executed, at the on-chain nonce or later), in nonce order, or with nonce:<n> only those at that nonce.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@safe:queue(safe? nonce:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |
| `nonce:` | `number` | `nonce:<n>` — only the transactions queued at this nonce |

<!-- HAND-WRITTEN -->

## Examples

Only trusted transactions are listed: anyone can push an unsigned
transaction to a Safe's queue, but only one signed by an owner or a
[delegate](../commands/delegate.md) is trusted. Transactions at a nonce the
Safe has already used are left out, since they can never execute.

Review each queued transaction:

```evml
load safe

set $safe 0x5afe3855358e112b5647b952709e6165e1c1eeee
loop $hash of @safe:queue($safe) (
  print @safe:verify($safe $hash)
)
```

Several transactions at one nonce compete: only one of them can execute.

```evml
load safe

set $safe 0x5afe3855358e112b5647b952709e6165e1c1eeee
print @safe:queue($safe nonce:@safe:nonce($safe))
```

## See Also
