---
title: Simulation
---

The `sim` module lets you test scripts on a forked chain without spending
gas or affecting real state.

## Basic Usage

```evml
load sim
load token

sim:fork (
  # Everything inside runs on a simulated fork
  sim:set-balance @me 100e18
  exec @token(DAI) "transfer(address,uint256)" 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 @token:amount(DAI 50)
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
load sim

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
load sim

sim:fork --block-number 18000000 (
  print @get(@token(DAI) "totalSupply()(uint256)")
)
```

## Impersonating Accounts

Use `--from` to simulate as a specific address:

```evml
load sim
load token

# A well-stocked account whose balance we borrow for the simulation
set $whale 0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf

sim:fork --from $whale (
  exec @token(DAI) "transfer(address,uint256)" @me @token:amount(DAI 1000)
)
```

## Manipulating State

### Set ETH Balance

```evml
load sim

sim:fork (
  sim:set-balance @me 100e18
  sim:set-balance 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 50e18
)
```

### Set Contract Bytecode

```evml
load sim

sim:fork (
  sim:set-code 0x44fA8E6f47987339850636F88629646662444217 0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe
)
```

### Set Storage Slots

```evml
load sim

sim:fork (
  sim:set-storage-at 0x44fA8E6f47987339850636F88629646662444217 0x00 0x01
)
```

## Assertions

Use `sim:expect` to verify conditions during simulation (or import it for
unqualified use with `load sim [fork expect]`):

```evml
load sim

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

Use the standard `wait` command to move forward in time (useful for
timelocks, vesting, etc.). Inside a fork the wait is instant — the chain's
clock is warped instead of sleeping:

```evml
load sim

sim:fork (
  # Advance 1 day
  wait 1d
)
```

## Suggested Assertions

A host can ask a simulation which checks would pin down what the run did:

```ts
const result = await evml.script(script).simulate({ suggest: true });
for (const { line, description } of result.suggestions ?? []) {
  console.log(description, "\n ", line);
}
```

Each suggestion is a complete `assert` line. It comes from an event the run
emitted and is only returned when the contract's own views confirm it: a role
that was granted and is held, an owner that changed, a balance after a
transfer. An event with no view to confirm it produces nothing.

Read a suggestion before adding it:

- It states what a contract says about itself. A contract can emit an event
  and answer its views to match, so a suggestion about an unknown contract is
  only as good as that contract. Token symbols are shown next to the token's
  address for the same reason.
- Amounts are the numbers this simulation produced. They are exact when the
  transaction runs right away; a proposal that executes days later may find a
  different balance.
- A check on someone else's balance (a recipient holds at least what it
  received) can be made to fail by that account moving its funds first.

`suggest: { tolerance: 5 }` widens amount checks to 5% of what changed (the
default is 1), and `suggest: { executor: safe }` guards a Safe, a timelock or
a DAO instead of the simulating account.

## Combining with DAO Operations

```evml
load aragonos [grant install @app]
load sim

sim:fork (
  aragonos:connect my-dao.aragonid.eth (
    # Test a governance action
    grant CREATE_VOTES_ROLE on @app(voting) to @me
    install $agent agent
  )
)
```
