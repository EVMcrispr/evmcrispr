#!/usr/bin/env bun
/**
 * Syncs the dependency list of packages/modules (@evmcrispr/modules) — and
 * the workspace-root dependencies — with the modules/ directory, so adding
 * a module requires no hand edits elsewhere.
 *
 * The root links exist for the isolated bun linker: test scaffolding in
 * packages/test-utils dynamically imports modules (and core/sdk) without
 * declaring them (declaring them would create a turbo task cycle), so
 * resolution walks up to the root node_modules. The root sits outside
 * every cycle.
 *
 * Usage: bun scripts/sync-modules.ts [--check]
 *   --check exits 1 if a dependency list is out of sync (used in CI).
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

let dirty = false;
function sync(path: string, mutate: (pkg: any) => void): void {
  const raw = readFileSync(path, "utf-8");
  const pkg = JSON.parse(raw);
  mutate(pkg);
  const out = `${JSON.stringify(pkg, null, 2)}\n`;
  if (out === raw) return;
  if (check) {
    console.error(`sync-modules: ${path} is out of sync.`);
    console.error("Run: bun run sync-modules && bun install");
    process.exit(1);
  }
  writeFileSync(path, out);
  dirty = true;
  console.log(`sync-modules: updated ${path}`);
}

sync(metaPath, (pkg) => {
  // workspace:^ so `bun publish` rewrites these to real versions — the
  // meta-package is published to npm and `*` would resolve to anything.
  pkg.dependencies = Object.fromEntries([
    ["@evmcrispr/core", "workspace:^"],
    ...pkgNames.map((name) => [name, "workspace:^"]),
  ]);
});

sync(join(ROOT, "package.json"), (pkg) => {
  const kept = Object.entries(pkg.dependencies ?? {}).filter(
    ([name]) => !name.startsWith("@evmcrispr/"),
  );
  pkg.dependencies = Object.fromEntries(
    [
      ["@evmcrispr/core", "workspace:*"],
      ["@evmcrispr/sdk", "workspace:*"],
      ...pkgNames.map((name) => [name, "workspace:*"]),
      ...kept,
    ].sort(([a], [b]) => a.localeCompare(b)),
  );
});

console.log(
  dirty ? "sync-modules: done — run `bun install`" : "sync-modules: up to date",
);
