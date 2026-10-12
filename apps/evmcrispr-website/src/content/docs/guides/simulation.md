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

Use `--as` to run the whole fork as a specific address. Inside it, `@me` is
that address and every transaction is sent from it:

```evml
load sim
load token

# A well-stocked account whose balance we borrow for the simulation
set $whale 0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf
set $recipient 0x44fA8E6f47987339850636F88629646662444217

sim:fork --as $whale (
  exec @token(DAI) "transfer(address,uint256)" $recipient @token:amount(DAI 1000)
)
```

To act as someone else for a few steps only, use
[`switch --as`](/reference/std/commands/switch/) with a block. The account is
put back when the block ends:

```evml
load sim
load token

set $whale 0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf

sim:fork (
  # The whale funds us...
  switch --as $whale (
    exec @token(DAI) "transfer(address,uint256)" @sender @token:amount(DAI 1000)
  )
  # ...and we are ourselves again
  print @balance(DAI @me)
)
```

`--on` names the chain to fork, whatever chain the script is on, and ties
`--block-number` to it:

```evml
load sim

sim:fork --on gnosis --block-number 30000000 (
  print @get(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d "totalSupply()(uint256)")
)
```

The same `switch` works outside a simulation: `switch gnosis ( … )` runs a
block on another chain and comes back. In a real run `--as` must name the
connected account.

Without a block of its own, a `switch` lasts until the end of the block it
is written in: inside a `sim:fork` that is the fork, inside an `if` or a
`loop` it is that block. Whatever a block changed is put back when it
ends.

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
import { suggestionScript, suggestionSource } from "@evmcrispr/sdk";

const result = await evml.script(script).simulate({ suggest: true });
for (const suggestion of result.suggestions ?? []) {
  console.log(suggestion.description);
  console.log(" ", suggestionSource(suggestion) ?? "");
}
// Everything needed to run them: loads, variables, then the lines.
console.log(suggestionScript(result.suggestions ?? []));
```

Each suggestion comes from an event the run emitted and is only returned when
the contract's own views confirm it: a role that was granted and is held, an
owner that changed, a balance after a transfer. An event with no view to
confirm it produces nothing.

### The sentence

`sentence` says what the suggestion checks, as parts a host can render:

```ts
[
  { type: "address", address: "0x28C6…1d60" },
  { type: "text", text: " keeps at least " },
  {
    type: "amount",
    value: "51950298200",      // base units: exactly what the line asserts
    bound: "floor",            // how it is asserted: floor, exact or ceiling
    token: "0xA0b8…eB48",      // or "native"
    symbol: "USDC",            // when the token has a short plain one
    decimals: 6,               // when the token says
    listed: true,              // the chain's token list gives it that symbol
    text: "51,950.2982 USDC",
  },
]
```

- An `address` part is an account or a contract. Link it to a block explorer.
  `name` is the short name a contract gives itself (a token's symbol): it is
  the contract's own word, so the address stays one click away. `listed: true`
  says the chain's token list gives that address that same name; without it,
  only the contract vouches for its name.
- An `amount` part carries the value the line asserts (a decimal string of
  base units) and a `text` for reading. A floor (`bound: "floor"`, the right
  side of a `>=`) is asserted at the precision it is said: four decimals
  from 1 up, four significant digits below 1, rounded down. So `text`,
  `value` and the number in the line are one number, and a suggested floor
  can sit up to one unit of its last digit below what the simulation
  computed, never above. An exact value (`"exact"`, an allowance) is given
  and asserted in full, digit for digit. An upper bound (`"ceiling"`, the fee
  left room for) is only said, rounded up. A host that formats `value`
  itself needs no rounding for a floor or an exact value. Dust is given in base units
  (`5 base units of WETH`), as is any amount of a token that does not say its
  decimals; the line then holds the same base-unit number, so the two always
  agree on the unit. The largest allowance there is reads "an unlimited
  allowance".

`description` is the same sentence as plain text, for a host that prints:
addresses are shortened, and a name or a symbol is always followed by its
address (`USDC (0xA0b8...eB48)`).

### The line

`line` is the `assert` to add, and `vars` the variables it uses:

```ts
{
  line: "assert @balance!($usdc $executor) >= @token:amount($usdc 51950.2982)",
  vars: [
    { name: "usdc", value: "0xA0b8…eB48" },
    { name: "executor", value: "0x28C6…1d60" },
  ],
}
```

- Every address is a variable, tokens included. A line never writes a token
  by its symbol: a symbol is resolved again each time the script runs,
  against whatever the token list says then, so a check confirmed on one
  token could move to another. The variable holds the address the suggestion
  was confirmed on. Only the chain's own currency, which names no contract,
  is written by its symbol (`@balance!(ETH $executor)`).
- The account whose balances are guarded is `$executor`. A token the chain's
  token list resolves a symbol to is named by that symbol (`$usdc`); the list
  only names the variable, the address is what the line reads. Everything
  else is named after what it is in that check (`$token`, `$spender`,
  `$owner`, `$proxy`, `$contract`). The name a contract gives itself is
  never a variable name: a token that merely calls itself USDC is `$token`.
  An address has one name across the suggestions of a run. One that plays
  two parts in it (a recipient that is also a spender) is named for neither,
  but by the one neutral thing that can be read of it on the fork: `$account`
  when it has no code, `$contract` when it has, and `$address` when that
  could not be read.
- An amount is `@token:amount(<token> <amount>)`, in the token's own units:
  the number the sentence shows for a floor
  (`>= @token:amount($usdc 51950.2982)`), every digit for an equality; for
  the chain's own currency the token is its
  symbol (`@token:amount(ETH 1.5)`). Where the sentence says base units, the
  line holds the plain integer instead: dust, a token that does not
  say its decimals, and a native currency whose decimals are not known to be
  18. A bare integer does not say what it counts, so such a line ends with a
  comment that does, naming the token as the line does:
  `assert @token:allowance!($weth $executor $spender) == 5  # base units of $weth`.
  A comment runs to the end of the line and changes nothing of what is
  asserted; a host that compares lines by what they mean ignores it. Zero is
  `0`, with no comment.

To add suggestions to a script, add in this order: a `load` for each module a
line uses that the script does not load yet (`load token` for
`@token:amount`, which a native-balance check uses too; loading a module
twice is an error), a `set $name <address>`
for each variable, then the lines. `suggestionScript` returns exactly that for
a list of suggestions from one run. If the script already has a variable of
the same name, rename the suggestion's first:
`renameSuggestionVariable(suggestion, "owner", "newOwner")`. A line only
refers to a variable as `$name`, its comment included, so that is a token
replacement.

### Where it comes from

`emitter` is the contract that emitted the event, `eventName` the event as
that contract names it (`Transfer`), and `emitterName` the short name the
contract gives itself, when it has one. A host can show "Suggested by USDC's
Transfer event" from them; `suggestionSource` gives that line as text, with
the address always included.

### Before adding one

- It states what a contract says about itself. A contract can emit an event
  and answer its views to match, so a suggestion about an unknown contract is
  only as good as that contract. That is why a name never appears without its
  address, and why a line holds addresses and no names.
- Amounts are the numbers this simulation produced (a floor rounded down to
  the precision shown). They hold when the transaction runs right away; a proposal that executes days later may find a
  different balance.
- The account that pays for gas has the fee taken from its own balance, and
  the fee is not known when the line is written. Its native-balance check
  leaves room for an assumed fee (three times what the simulated run would
  cost at the current gas price) and says how much. A dearer transaction than
  that fails the check.
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
