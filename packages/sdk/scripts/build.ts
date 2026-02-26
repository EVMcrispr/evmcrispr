#!/usr/bin/env bun
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
/**
 * Cross-platform build script for EVMcrispr packages.
 * Uses Bun Shell for OS-agnostic command execution.
 *
 * Usage: bun evmcrispr-build [entrypoint]
 *   entrypoint defaults to ./src/index.ts
 */
import { $ } from "bun";

const entrypoint = process.argv[2] || "./src/index.ts";
const tempTsconfigPath = join(process.cwd(), ".tsconfig.build.tmp.json");
const tempTsconfig = {
  extends: "./tsconfig.json",
  compilerOptions: {
    noEmit: false,
    emitDeclarationOnly: true,
    outDir: "./dist",
    rootDir: "./src",
    // Keep monorepo path aliases for type-check, but disable them for build-time
    // declaration emit to avoid pulling external source files under rootDir ./src.
    paths: {},
  },
  include: ["src"],
};

await $`bun run ${import.meta.dir}/codegen.ts`;
await $`rm -rf dist`;
await $`bun build ${entrypoint} --outdir ./dist --format esm --sourcemap=linked --packages external`;
await writeFile(tempTsconfigPath, `${JSON.stringify(tempTsconfig, null, 2)}\n`);

try {
  await $`tsc -p ${tempTsconfigPath}`;
} finally {
  await unlink(tempTsconfigPath).catch(() => {});
}
