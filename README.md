# EVMcrispr

[![npm](https://img.shields.io/npm/v/@1hive/evmcrispr.svg?logo=npm)](https://www.npmjs.com/package/@1hive/evmcrispr)
[![Coverage Status](https://img.shields.io/coveralls/github/1Hive/evmcrispr?logo=coveralls&branch=master)](https://coveralls.io/github/1Hive/evmcrispr?branch=master)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

**EVMcrispr** is a powerful TypeScript library and scripting language for interacting with EVM-based DAOs. It lets you encode complex sequences of actions — installing apps, managing permissions, transferring funds, and more — into EVM scripts that can be executed through DAO governance in a single transaction.

> **Note:** EVMcrispr is in active development. The API may change before reaching 1.0.

**Documentation:** [docs.evmcrispr.com](https://docs.evmcrispr.com)

## Features

- **Declarative scripting language (cas11)** — Write human-readable scripts that compile to EVM calldata
- **Modular architecture** — Load only the modules you need (`std`, `aragonos`, `ens`, `giveth`, `tenderly`)
- **Read-only contract calls** — Chain view function calls with the `::` operator (e.g. `token-manager::token()::decimals()`)
- **Native arithmetic expressions** — Use math with operator precedence and parentheses directly in scripts
- **Multi-chain support** — Switch networks dynamically within a script using `switch`
- **Recursive DAO scoping** — Nest `connect` commands for cross-DAO operation scripts
- **Web terminal app** — Interactive browser-based editor with Monaco, autocompletion, and wallet integration

## Monorepo Structure

This project is a [Turborepo](https://turbo.build/) monorepo managed with [Bun](https://bun.sh/).

```
evmcrispr/
├── apps/
│   └── evmcrispr-terminal    # Web-based terminal UI (React + Vite + Chakra UI)
├── packages/
│   ├── evmcrispr              # Core library (@1hive/evmcrispr)
│   ├── config-eslint          # Shared ESLint configuration
│   ├── config-prettier        # Shared Prettier configuration
│   └── config-typescript      # Shared TypeScript configuration
```

## Modules

EVMcrispr uses a module system loaded via the `load` command. The `std` module is loaded by default.

### `std` (loaded by default)

| Commands | Helpers |
|----------|---------|
| `exec`, `set`, `load`, `switch`, `raw`, `print`, `for` | `@me`, `@token`, `@token.balance`, `@date`, `@get`, `@id`, `@ipfs`, `@abi`, `@ens`, `@namehash` |

### `aragonos`

| Commands | Helpers |
|----------|---------|
| `connect`, `install`, `upgrade`, `grant`, `revoke`, `act`, `forward`, `new-dao`, `new-token` | `@aragonEns` |

### `ens`

| Commands | Helpers |
|----------|---------|
| `renew` | `@contenthash` |

### `giveth`

| Commands | Helpers |
|----------|---------|
| `donate`, `initiate-givbacks`, `verify-givbacks`, `finalize-givbacks` | `@projectAddr` |

### `tenderly`

| Commands | Helpers |
|----------|---------|
| `fork`, `expect`, `wait` | — |

## Quick Start

### Installation

```sh
bun add @1hive/evmcrispr viem
```

### Usage

```ts
import { EVMcrispr } from "@1hive/evmcrispr";
```

Write scripts using the cas11 scripting language:

```
load aragonos as ar

set $dao 0xYourDaoAddress

ar:connect $dao token-manager voting (
  install agent:new-agent
  grant voting agent:new-agent TRANSFER_ROLE voting
  exec vault transfer @token(WXDAI) agent:new-agent 100e18
  act agent:new-agent @token(WXDAI) withdraw(uint256) 100e18
  exec agent:new-agent transfer XDAI vault 100e18
)
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) (v1.2+)
- [Node.js](https://nodejs.org/) (v18+)

### Setup

```sh
# Install dependencies
bun install

# Build all packages
bun run build

# Run the terminal app in development mode
bun run dev:terminal
```

### Commands

| Command | Description |
|---------|-------------|
| `bun run build` | Build all packages |
| `bun run dev` | Start all packages in dev/watch mode |
| `bun run dev:terminal` | Start the terminal app |
| `bun run test` | Run tests |
| `bun run test:coverage` | Run tests with coverage |
| `bun run lint` | Lint all packages |
| `bun run type-check` | Type-check all packages |
| `bun run format` | Format code with Prettier |

### Environment Variables

Copy the example env file in the core package and fill in the values:

```sh
cp packages/evmcrispr/.env.example packages/evmcrispr/.env
```

| Variable | Description |
|----------|-------------|
| `ARCHIVE_NODE_ENDPOINT` | Alchemy or similar archive node RPC URL |
| `ETHERSCAN_API` | Etherscan API key |
| `VITE_PINATA_JWT` | Pinata JWT for IPFS operations |

## Contributing

We welcome community contributions! Please check out our open [Issues](https://github.com/EVMcrispr/evmcrispr/issues) to get started.

## License

[AGPL-3.0](./LICENSE) — Copyright (C) Blossom Labs
