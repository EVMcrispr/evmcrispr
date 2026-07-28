---
title: Contributing
---

## Development Setup

```sh
# Clone and install
git clone https://github.com/EVMcrispr/evmcrispr.git
cd evmcrispr
bun install

# Build everything
bun run build

# Start the terminal in dev mode
bun dev:terminal

# Start the docs website in dev mode
bun dev:website
```

## Running Tests

```sh
# Unit tests
bun test:unit

# Integration tests (requires anvil running)
bun test:integration

# Coverage report
bun test:coverage
```

## Linting

```sh
biome check .        # Check for issues
biome check --write . # Auto-fix
biome format --write . # Format
```

## Adding a Command

1. Create `modules/<mod>/src/commands/<name>.ts` using `defineCommand`
2. Add a `description` field for documentation
3. Run codegen: `cd modules/<mod> && bun ../../packages/sdk/scripts/codegen.ts`
4. Run `bun run build`
5. Regenerate docs: `bun scripts/generate-docs.ts`

## Adding a Helper

1. Create `modules/<mod>/src/helpers/<name>.ts` using `defineHelper`
2. Include `description`, `returnType`, and `args` fields
3. Run codegen and build as above
4. Regenerate docs

## Documentation

Reference docs are auto-generated from source metadata by `scripts/generate-docs.ts`.
Hand-written content (examples, notes, see-also) below the `<!-- HAND-WRITTEN -->`
marker in each `.md` file is preserved on regeneration.

To add examples to a command or helper doc:
1. Edit the `.md` file next to the `.ts` source file
2. Add your content below the `<!-- HAND-WRITTEN -->` marker
3. Run `bun scripts/generate-docs.ts` to verify preservation

## Project Structure

See [Architecture](architecture.md) for a detailed overview.
