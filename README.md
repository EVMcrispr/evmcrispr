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

## Deployments

Production is the default — the terminal ([app.evmcrispr.com](https://app.evmcrispr.com)) and the website ([evmcrispr.com](https://evmcrispr.com)) build with no URL configuration. The experimental deploys ([next.evmcrispr.com](https://next.evmcrispr.com) / [next-docs.evmcrispr.com](https://next-docs.evmcrispr.com)) override:

| Variable | Default | Experimental deploys | Used by |
|---|---|---|---|
| `PUBLIC_SITE_URL` | `https://evmcrispr.com` | `https://next-docs.evmcrispr.com` | website (canonical URL/sitemap) and terminal (docs links) |
| `PUBLIC_TERMINAL_URL` | `https://app.evmcrispr.com` | `https://next.evmcrispr.com` | website (landing-page terminal link) |
| `VITE_PUBLIC_EXPERIMENTAL` | off | `true` | both — enables ⚗️ experimental modules, commands and docs pages |

Service keys (terminal build): `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_DRPC_API_KEY` (RPC), `VITE_ETHERSCAN_API_KEY` (verified contracts; falls back to Blockscout keyless), `VITE_PINATA_JWT` (IPFS pinning), and optionally `VITE_EVMCRISPR_API_URL` (defaults to `https://api.evmcrispr.com`).

The MCP server is deployment-agnostic (`PORT`, `HOST`, `TRANSPORT`, `CORS_ORIGIN`, `VITE_PINATA_JWT`); its share links intentionally point at next.evmcrispr.com while the MCP is experimental.

## Documentation

- [Getting Started](apps/evmcrispr-website/src/content/docs/intro/getting-started.md)
- [The EVML Language](apps/evmcrispr-website/src/content/docs/language/syntax.md)
- [Full Reference](https://evmcrispr.com/llms-full.txt)

## License

[GPL-3.0](LICENSE)
