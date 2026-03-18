---
title: "sim:set-balance"
---

Set the ETH balance of an account in a fork simulation.

## Syntax

```evml
sim:set-balance <address> <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Contract or account address |
| `amount` | `number` | New balance in wei |

## Examples

```evml
# Fund the connected wallet with 100 ETH
sim:fork --using anvil (
  sim:set-balance @me 100e18
)
```

<!-- HAND-WRITTEN -->

## Notes

- Can only be used inside a `sim:fork` block
- The amount is in wei (use `e18` for ETH)

## See Also

- [fork](fork.md) — create a simulation fork
- [set-code](set-code.md) — set contract bytecode
- [set-storage-at](set-storage-at.md) — set storage slots
