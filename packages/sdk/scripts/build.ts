#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { cp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
/**
 * Cross-platform build script for EVMcrispr packages.
 * Uses Bun Shell for OS-agnostic command execution.
 *
 * Usage: bun evmcrispr-build [mode] [entrypoints...] [--splitting] [--production]
 *   entrypoints default to ./src/index.ts
 *   --codegen only generates src/_generated.ts
 *   --types only emits dist declarations (unchecked: type-check owns checking)
 *   --bundle only bundles JS into dist (assumes codegen already ran)
 *   With no mode flag, runs all three (codegen, bundle, checked declarations).
 *   --splitting enables code splitting (lazy chunks for dynamic imports)
 *   --production builds with production semantics (required for JSX
 *     packages: lowers to react/jsx-runtime instead of the dev transform)
 *   --assets=<from:to> copies a static asset directory into dist/<to> after
 *     bundling (e.g. wasm artifacts referenced via `new URL`, which `bun
 *     build` does not emit)
 */
import { $, Glob } from "bun";

const args = process.argv.slice(2);
const splitting = args.includes("--splitting");
const production = args.includes("--production");
const codegenOnly = args.includes("--codegen");
const typesOnly = args.includes("--types");
const bundleOnly = args.includes("--bundle");
const full = !codegenOnly && !typesOnly && !bundleOnly;
const entrypoints = args.filter((a) => !a.startsWith("--"));
if (entrypoints.length === 0) entrypoints.push("./src/index.ts");

const distDir = join(process.cwd(), "dist");

/** Remove dist files matching (or not matching) declaration outputs, so the
 * `types` and `bundle` tasks can each refresh their half of dist without
 * clobbering the other's. */
async function cleanDist(which: "types" | "bundle") {
  if (!existsSync(distDir)) return;
  const isDts = (f: string) => f.endsWith(".d.ts") || f.endsWith(".d.ts.map");
  for await (const file of new Glob("**/*").scan({
    cwd: distDir,
    onlyFiles: true,
  })) {
    if (isDts(file) === (which === "types")) {
      await unlink(join(distDir, file)).catch(() => {});
    }
  }
}

if (codegenOnly || full) {
  await $`bun run ${import.meta.dir}/codegen.ts`;
  if (codegenOnly) process.exit(0);
}

if (full) await rm(distDir, { recursive: true, force: true });

if (bundleOnly || full) {
  if (bundleOnly) await cleanDist("bundle");

  // Bun's bundler applies the package's own `sideEffects` hint to its own
  // modules and tree-shakes re-exported module bodies away, emitting entry
  // files whose `export { ... }` bindings are never defined (broken ESM).
  // The hint is meant for downstream bundlers consuming the published
  // package, not for bundling the package itself — strip it while
  // `bun build` runs and restore it afterwards.
  const pkgJsonPath = join(process.cwd(), "package.json");
  const pkgJsonRaw = await readFile(pkgJsonPath, "utf-8");
  const pkgJson = JSON.parse(pkgJsonRaw);
  const hasSideEffectsHint = "sideEffects" in pkgJson;
  if (hasSideEffectsHint) {
    delete pkgJson.sideEffects;
    await writeFile(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
  }
  try {
    await $`bun build ${entrypoints} --outdir ./dist --format esm --sourcemap=linked --packages external ${splitting ? "--splitting" : []} ${production ? "--production" : []}`;
  } finally {
    if (hasSideEffectsHint) await writeFile(pkgJsonPath, pkgJsonRaw);
  }

  // Bundling flattens modules into dist root, so an asset referenced as
  // `new URL("./pkg/x.wasm", import.meta.url)` must land at dist/pkg/x.wasm.
  for (const spec of args.filter((a) => a.startsWith("--assets="))) {
    const [from, to] = spec.slice("--assets=".length).split(":");
    await cp(join(process.cwd(), from), join(distDir, to ?? from), {
      recursive: true,
    });
  }
}

if (typesOnly || full) {
  if (typesOnly) await cleanDist("types");

  const tempTsconfigPath = join(process.cwd(), ".tsconfig.build.tmp.json");
  const tempTsconfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      noEmit: false,
      emitDeclarationOnly: true,
      outDir: "./dist",
      rootDir: "./src",
      // The `types` task only emits; `type-check` owns checking (it also
      // covers test/, which emit's include below does not).
      noCheck: typesOnly,
      // Keep monorepo path aliases for type-check, but disable them for
      // build-time declaration emit to avoid pulling external source files
      // under rootDir ./src.
      paths: {},
    },
    include: ["src"],
  };
  await writeFile(
    tempTsconfigPath,
    `${JSON.stringify(tempTsconfig, null, 2)}\n`,
  );
  try {
    await $`tsgo -p ${tempTsconfigPath}`;
  } finally {
    await unlink(tempTsconfigPath).catch(() => {});
  }
}
