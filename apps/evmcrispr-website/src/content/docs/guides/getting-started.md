---
title: Getting Started
---

EVMcrispr is a DSL for encoding and executing batched EVM transactions.
You can use it in the web terminal or programmatically.

## Web Terminal

Visit [evmcrispr.com](https://evmcrispr.com) to open the web terminal.
Connect your wallet, write a script, and click Execute.

## Active Chain

Every script starts on **Ethereum mainnet** by default — independent of
the chain your wallet is connected to. Use `switch <chainName>` (or a
chain id) at the top of the script to run it on a different chain:

```evml
switch gnosis

exec @token(WXDAI) "transfer(address,uint256)" 0x1234...abcd 1e18
```

Before execution the terminal scans every `switch` in your script and
asks the wallet to add (and switch to) each referenced chain up front,
so chain prompts don't interrupt a running script. Wallets that are
pinned to a single chain — for example a Safe App or some
WalletConnect-compatible wallets — will refuse to switch; in that case
the terminal returns one of these errors before any transaction is
submitted:

- `The script should start with \`switch <chainName>\`.` — the script
  defaults to mainnet but the wallet only supports a different chain.
- `Wallet only supports <chainName>.` — the script references multiple
  chains; rewrite it to target only the wallet's chain.

## Your First Script

A simple script that transfers tokens:

```evml
# Transfer 100 DAI to an address
exec @token(DAI) "transfer(address,uint256)" 0x1234...abcd @token.amount(DAI 100)
```

Breaking this down:
- `exec` — the command that calls a contract function
- `@token(DAI)` — resolves the DAI token symbol to its contract address
- `"transfer(address,uint256)"` — the function signature
- `0x1234...abcd` — the recipient address
- `@token.amount(DAI 100)` — converts 100 DAI to base units (100 * 10^18)

## Reading Contract State

Use `@get` to read data from contracts:

```evml
# Check your DAI balance
set $balance @get(@token(DAI) "balanceOf(address)(uint256)" @me)
print "Balance:" $balance
```

## Batching Transactions

Wrap multiple commands in `batch` to execute them as a single transaction:

```evml
batch (
  exec @token(DAI) "approve(address,uint256)" 0xRouter... @token.amount(DAI 1000)
  exec 0xRouter... "swap(address,uint256)" @token(DAI) @token.amount(DAI 1000)
)
```

## Working with Variables

```evml
set $router 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
set $amount @token.amount(DAI 100)

exec @token(DAI) "approve(address,uint256)" $router $amount
exec $router "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)" $amount 0 [@token(DAI) @token(WETH)] @me @date("2025-12-31")
```

## Simulation

Test your scripts without spending gas by loading the `sim` module:

```evml
load sim

sim:fork 1 (
  sim:set-balance @me 100e18
  exec @token(DAI) "transfer(address,uint256)" 0x1234...abcd @token.amount(DAI 50)
  sim:expect @bool(@get(@token(DAI) "balanceOf(address)(uint256)" 0x1234...abcd) > 0)
)
```

## Working with Aragon DAOs

```evml
load aragonos

aragonos:connect my-dao.aragonid.eth (
  aragonos:grant @me voting CREATE_VOTES_ROLE
  aragonos:install $agent agent:new
)
```

## Loading Modules

The `std` module is always available. Load others as needed:

```evml
load aragonos   # Aragon DAO operations
load sim        # Chain simulation
load ens        # ENS domains
load giveth     # Giveth protocol
load http       # HTTP + JSON
```

## Next Steps

- [Language Basics](language-basics.md) — full syntax reference
- [Module Reference](../../modules/std/README.md) — all commands and helpers
