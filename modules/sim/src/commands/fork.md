# sim:fork

Fork the blockchain and execute commands in a simulation.

## Syntax

```
sim:fork <block>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| block | `block` | Yes |

## Options

| Name | Type |
|------|------|
| --block-number | `number` |
| --from | `address` |
| --auth-token | `string` |
| --using | `simulation-mode` |

<!-- HAND-WRITTEN -->









## Examples

```
# Fork mainnet using the default backend (ethereumjs)
load sim
sim:fork (
  sim:set-balance @me 100e18
  exec @token(DAI) "transfer(address,uint256)" 0x1234... @token.amount(DAI 50)
)

# Use Anvil backend
sim:fork --using anvil (
  sim:set-balance @me 100e18
)

# Fork at a specific block
sim:fork --block-number 18000000 (
  print @get(@token(DAI) "totalSupply()(uint256)")
)

# Simulate as a specific address
sim:fork --from 0xWhale... (
  exec @token(DAI) "transfer(address,uint256)" @me @token.amount(DAI 1000)
)
```

## Notes

- Supported backends: `anvil`, `hardhat`, `tenderly`, `ethereumjs` (default)
- The `ethereumjs` backend runs entirely in the browser — no external node needed
- All commands inside the fork block execute against the simulated state
- Changes do not affect the real chain

## See Also

- [set-balance](set-balance.md) — set account ETH balances
- [expect](expect.md) — assert conditions
- [wait](wait.md) — advance time
