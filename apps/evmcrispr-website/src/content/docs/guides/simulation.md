---
title: Simulation
---

The `sim` module lets you test scripts on a forked chain without spending
gas or affecting real state.

## Basic Usage

```evml
load sim

sim:fork (
  # Everything inside runs on a simulated fork
  sim:set-balance @me 100e18
  exec @token(DAI) "transfer(address,uint256)" 0x1234... @token.amount(DAI 50)
)
```

## Choosing a Backend

EVMcrispr supports multiple simulation backends:

| Backend | Flag | Notes |
|---------|------|-------|
| EthereumJS | (default) | Runs in-browser, no external node needed |
| Anvil | `--using anvil` | Fastest, needs `anvil` running locally |
| Hardhat | `--using hardhat` | Needs Hardhat node running locally |
| Tenderly | `--using tenderly` | Cloud-based, needs `--auth-token` |

```evml
# Use Anvil
sim:fork --using anvil (
  sim:set-balance @me 100e18
)

# Use Tenderly
sim:fork --using tenderly --auth-token "your-token" (
  sim:set-balance @me 100e18
)
```

## Forking at a Specific Block

```evml
sim:fork --block-number 18000000 (
  print @get(@token(DAI) "totalSupply()(uint256)")
)
```

## Impersonating Accounts

Use `--from` to simulate as a specific address:

```evml
sim:fork --from 0xWhale... (
  exec @token(DAI) "transfer(address,uint256)" @me @token.amount(DAI 1000)
)
```

## Manipulating State

### Set ETH Balance

```evml
sim:set-balance @me 100e18
sim:set-balance 0x1234... 50e18
```

### Set Contract Bytecode

```evml
sim:set-code 0xContract... 0x6080...
```

### Set Storage Slots

```evml
sim:set-storage-at 0xContract... 0x00 0x01
```

## Assertions

Use `expect` to verify conditions during simulation:

```evml
sim:fork (
  sim:set-balance @me 100e18

  # Assert balance was set
  sim:expect @bool(@get(@token(DAI) "balanceOf(address)(uint256)" @me) >= 0)

  # Assert equality
  set $a 42
  sim:expect @bool($a == 42)

  # Assert inequality
  sim:expect @bool(1 != 2)
)
```

If an assertion fails, the script halts with an error.

## Advancing Time

Use `wait` to move forward in time (useful for timelocks, vesting, etc.):

```evml
sim:fork (
  # Advance 1 day (86400 seconds)
  sim:wait 86400

  # Advance with a specific block period (seconds per block)
  sim:wait 86400 12
)
```

## Combining with DAO Operations

```evml
load aragonos
load sim

sim:fork (
  aragonos:connect my-dao.aragonid.eth (
    # Test a governance action
    grant @me @app(voting) CREATE_VOTES_ROLE
    install $agent agent:new
  )
)
```
