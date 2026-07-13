#!/usr/bin/env bun
/**
 * Syncs the dependency list of packages/modules (@evmcrispr/modules) with the
 * modules/ directory, so adding a module requires no hand edits elsewhere.
 *
 * Usage: bun scripts/sync-modules.ts [--check]
 *   --check exits 1 if the dependency list is out of sync (used in CI).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PREFIX = "@evmcrispr/module-";
const check = process.argv.includes("--check");

const pkgNames: string[] = [];
for (const dir of readdirSync(join(ROOT, "modules")).sort()) {
  const pkgPath = join(ROOT, "modules", dir, "package.json");
  if (!existsSync(pkgPath)) continue;
  const name = JSON.parse(readFileSync(pkgPath, "utf-8")).name as string;
  if (!name?.startsWith(PREFIX)) continue;
  if (name.slice(PREFIX.length) !== dir) {
    throw new Error(
      `modules/${dir}: package name ${name} does not match directory name`,
    );
  }
  pkgNames.push(name);
}

const metaPath = join(ROOT, "packages/modules/package.json");
const metaRaw = readFileSync(metaPath, "utf-8");
const meta = JSON.parse(metaRaw);
meta.dependencies = Object.fromEntries([
  ["@evmcrispr/core", "*"],
  ...pkgNames.map((name) => [name, "*"]),
]);

const out = `${JSON.stringify(meta, null, 2)}\n`;
if (out === metaRaw) {
  console.log("sync-modules: up to date");
} else if (check) {
  console.error("sync-modules: packages/modules/package.json is out of sync.");
  console.error("Run: bun run sync-modules && bun install");
  process.exit(1);
} else {
  writeFileSync(metaPath, out);
  console.log(
    "sync-modules: updated packages/modules/package.json — run `bun install`",
  );
}
