import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { evml } from "@evmcrispr/core";

const MODULES_DIR = resolve(import.meta.dirname, "../../../../modules");
const PREFIX = "@evmcrispr/module-";

// Dynamic-string import: resolves at load time without declaring the modules
// as dependencies (which would create a turbo cycle — modules depend on
// test-utils for their tests).
const loadModule = (pkgName: string) => import(pkgName);

/**
 * Register all modules discovered in the monorepo's modules/ directory on
 * the shared `evml` tag. Call once per test setup file.
 */
export function registerAllModules(): void {
  const entries = [];
  for (const dir of readdirSync(MODULES_DIR)) {
    const pkgPath = join(MODULES_DIR, dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkgName = JSON.parse(readFileSync(pkgPath, "utf-8")).name as string;
    if (!pkgName?.startsWith(PREFIX)) continue;
    const name = pkgName.slice(PREFIX.length);
    // std is always loaded by @evmcrispr/core
    if (name === "std") continue;
    entries.push({ name, load: () => loadModule(pkgName) });
  }
  evml.use(...entries);
}
