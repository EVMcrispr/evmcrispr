---
title: Architecture
---

EVMcrispr is a TypeScript monorepo organized into packages, modules, and apps.

## Overview

```
packages/
  core/        Parser, interpreter, AST, completions
  sdk/         Module SDK + codegen script
  ui/          Shared UI components
modules/
  std/         Default module (always loaded)
  aragonos/    Aragon DAO operations
  sim/         Chain fork simulation
  ens/         ENS domain operations
  giveth/      Giveth protocol
  http/        HTTP + JSON helpers
apps/
  evmcrispr-terminal/   Web terminal (React + Monaco + Wagmi)
  evmcrispr-website/    Landing page + docs (Astro + Starlight)
scripts/
  generate-docs.ts      Documentation generator
```

## Core Package (`packages/core`)

The core package contains the DSL engine:

- **Parser**: Converts script text into an AST using the arcsecond parser combinator library
- **Interpreter**: Walks the AST, resolving helpers, evaluating expressions, and collecting actions
- **Completions**: Provides Monaco editor completions based on loaded modules
- **Hover Docs**: Shows inline documentation from module metadata

## SDK Package (`packages/sdk`)

Provides the API for building modules:

- `defineModule` — Create a module class
- `defineCommand` — Define a command with args, opts, and a run function
- `defineHelper` — Define a helper with args, return type, and a run function
- `encodeAction` — Encode a contract call into an Action

The SDK also includes `scripts/codegen.ts` which scans module source files
and generates `_generated.ts` with typed import maps and metadata.

## Module System

Each module follows the same structure:

```
modules/<name>/
  src/
    commands/<name>.ts    # One file per command
    helpers/<name>.ts     # One file per helper
    _generated.ts         # Auto-generated import map
    index.ts              # Module class definition
```

### Commands

Commands return `Action[]` — an array of transaction descriptors. Each action
contains a target address, encoded calldata, and optional value/gas fields.

### Helpers

Helpers return string values (numbers, addresses, etc. are all string-encoded).
They can read chain state via the module's client but don't produce transactions.

### Module Lifecycle

1. User writes `load <module>` in a script
2. The interpreter loads the module class and instantiates it
3. Commands/helpers are lazy-loaded from `_generated.ts` when first referenced
4. The module instance is passed to each command/helper's `run` function

## Action Pipeline

```
Script → Parser → AST → Interpreter → Action[] → Execution
```

1. **Parse**: Text is parsed into an AST of command nodes, helper expressions, etc.
2. **Interpret**: The interpreter walks the AST, resolving variables and helpers
3. **Collect**: Commands produce Action arrays which are collected
4. **Execute**: Actions are sent to the wallet (or simulation backend)

## Simulation

The sim module intercepts the action pipeline:

- `sim:fork` creates a local chain fork (EthereumJS, Anvil, Hardhat, or Tenderly)
- Commands inside the fork block execute against the simulated state
- RPC actions (`set-balance`, `set-code`, etc.) modify fork state directly
- Transaction actions are sent to the fork's wallet client

## Documentation Pipeline

```
Source files → codegen.ts → _generated.ts → generate-docs.ts → .md files
```

- `codegen.ts` extracts metadata (name, description, args, return type) from source
- `generate-docs.ts` reads `_generated.ts` and source files to produce markdown
- Hand-written content below `<!-- HAND-WRITTEN -->` is preserved on regeneration
- Website reference docs are auto-generated into the Starlight content directory
