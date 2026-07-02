import { evml } from "@evmcrispr/core";

const loadModule = (moduleName: string) => import(moduleName);

/**
 * Register all available EVMcrispr modules on the shared `evml` tag.
 * Call once per test setup file.
 */
export function registerAllModules(): void {
  evml.use(
    { name: "aragonos", load: () => loadModule("@evmcrispr/module-aragonos") },
    { name: "sim", load: () => loadModule("@evmcrispr/module-sim") },
    { name: "giveth", load: () => loadModule("@evmcrispr/module-giveth") },
    { name: "ens", load: () => loadModule("@evmcrispr/module-ens") },
    { name: "http", load: () => loadModule("@evmcrispr/module-http") },
    { name: "lang", load: () => loadModule("@evmcrispr/module-lang") },
    {
      name: "assertions",
      load: () => loadModule("@evmcrispr/module-assertions"),
    },
  );
}
