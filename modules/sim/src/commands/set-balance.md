# sim:set-balance

Set the ETH balance of an account in a fork simulation.

## Syntax

```
sim:set-balance <address> <amount>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| address | `address` | Yes |
| amount | `number` | Yes |

<!-- HAND-WRITTEN -->









## Examples

```
# Fund the connected wallet with 100 ETH
sim:set-balance @me 100e18

# Fund a specific address
sim:set-balance 0x64c0...a84e 100e18
```

## Notes

- Can only be used inside a `sim:fork` block
- The amount is in wei (use `e18` for ETH)

## See Also

- [fork](fork.md) — create a simulation fork
- [set-code](set-code.md) — set contract bytecode
- [set-storage-at](set-storage-at.md) — set storage slots
