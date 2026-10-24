#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."

export HUSKY=0
bun install --frozen-lockfile
bunx --no-install turbo run build type-check --filter=evmcrispr-api
bun run --cwd apps/evmcrispr-api test:unit
