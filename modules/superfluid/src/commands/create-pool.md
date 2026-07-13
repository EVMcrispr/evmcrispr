---
title: "superfluid:create-pool"
---

Create a GDA distribution pool for a SuperToken and bind the predicted pool address to <variable>. Members hold units and every distribution splits pro-rata to units. The prediction reads the pool factory's account nonce, so it assumes no other pool is created on the chain between planning and execution.

## Syntax

```evml
superfluid:create-pool <variable> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the new pool's address to |
| `token` | `supertoken` | SuperToken symbol (e.g. USDCx) or address the pool distributes |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--admin` | `address` | Pool admin, the only account that can update member units (defaults to the connected account) |
| `--transferable-units` | `bool` | Let members transfer their units (default false) |
| `--open-distribution` | `bool` | Let anyone distribute through the pool, not just the admin (default false) |

## Examples

```evml
# Create a rewards pool, weight two members 3:1 and distribute 400 xDAIx (alice receives 300, bob 100)
set $alice 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
set $bob 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

superfluid:create-pool $rewards xDAIx
superfluid:set-units 3 to $alice in $rewards
superfluid:set-units 1 to $bob in $rewards
superfluid:distribute 400e18 xDAIx to $rewards
```

<!-- HAND-WRITTEN -->

## See Also

