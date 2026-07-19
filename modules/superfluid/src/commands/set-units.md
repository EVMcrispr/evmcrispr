---
title: "superfluid:set-units"
---

Set a member's share units in a GDA pool (admin only). Units are plain unitless weights: a member with 3 units earns 3x what a member with 1 unit earns. Setting 0 removes the member from future distributions.

## Syntax

```evml
superfluid:set-units <units> <to> <member> <in> <pool>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `units` | `number` | New unit count for the member (0 removes them) |
| `to` | `command` | Keyword `to` |
| `member` | `address` | Pool member |
| `in` | `command` | Keyword `in` |
| `pool` | `address` | GDA pool address |

## Examples

```evml
# Give a contributor 5 units in a freshly created rewards pool
superfluid:create-pool $rewards xDAIx
superfluid:set-units 5 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $rewards
```

<!-- HAND-WRITTEN -->

## See Also
