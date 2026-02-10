#!/usr/bin/env bun
/**
 * Cross-platform build script for EVMcrispr packages.
 * Uses Bun Shell for OS-agnostic command execution.
 *
 * Usage: bun evmcrispr-build [entrypoint]
 *   entrypoint defaults to ./src/index.ts
 */
import { $ } from "bun";

const entrypoint = process.argv[2] || "./src/index.ts";

await $`bun run ${import.meta.dir}/codegen.ts`;
await $`rm -rf dist`;
await $`bun build ${entrypoint} --outdir ./dist --format esm --sourcemap=linked --packages external`;
await $`tsc`;
