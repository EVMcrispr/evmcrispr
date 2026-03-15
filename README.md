# EVMcrispr

A domain-specific language for encoding and executing batched EVM transactions targeting smart contracts, Aragon DAOs, ENS, and DeFi protocols.

## Quick Start

```
# Install dependencies
bun install

# Start the web terminal
bun dev:terminal

# Start the docs website
bun dev:website
```

Visit [evmcrispr.com](https://evmcrispr.com) to use the hosted terminal.

## Example Script

```
# Approve and swap tokens in a single transaction
load sim

sim:fork (
  set $router 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
  set $amount @token.amount(DAI 100)

  batch (
    exec @token(DAI) "approve(address,uint256)" $router $amount
    exec $router "swapExactTokensForETH(uint256,uint256,address[],address,uint256)" $amount 0 [@token(DAI) @token(WETH)] @me @date("2025-12-31")
  )

  sim:expect @bool(@get(@token(WETH) "balanceOf(address)(uint256)" @me) > 0)
)
```

## Modules

| Module | Description | Commands | Helpers |
|--------|-------------|----------|---------|
| [std](modules/std/README.md) | Core language (always loaded) | 13 | 55 |
| [aragonos](modules/aragonos/README.md) | Aragon DAO operations | 9 | 3 |
| [sim](modules/sim/README.md) | Chain fork simulation | 6 | - |
| [ens](modules/ens/README.md) | ENS domain operations | 1 | 1 |
| [giveth](modules/giveth/README.md) | Giveth protocol | 4 | 1 |
| [http](modules/http/README.md) | HTTP + JSON | - | 3 |

## Project Structure

```
packages/
  core/          Parser, interpreter, AST
  sdk/           Module SDK (defineCommand, defineHelper)
modules/
  std/           Default module — always loaded
  aragonos/      Aragon DAO operations
  sim/           Chain fork simulation
  ens/           ENS domain operations
  giveth/        Giveth protocol
  http/          HTTP + JSON helpers
apps/
  evmcrispr-terminal/   React + Monaco web terminal
  evmcrispr-website/    Astro landing page + docs
```

## Development

```sh
bun install           # Install dependencies
bun run build         # Build all packages
bun test:unit         # Run unit tests
bun test:integration  # Run integration tests (needs anvil)
biome check .         # Lint
```

## Documentation

- [Getting Started](apps/evmcrispr-website/src/content/docs/guides/getting-started.md)
- [Language Basics](apps/evmcrispr-website/src/content/docs/guides/language-basics.md)
- [Full Reference](https://evmcrispr.com/llms-full.txt)

## License

[GPL-3.0](LICENSE)
