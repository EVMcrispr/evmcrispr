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
    { name: "token", load: () => loadModule("@evmcrispr/module-token") },
    {
      name: "access-control",
      load: () => loadModule("@evmcrispr/module-access-control"),
    },
    { name: "governor", load: () => loadModule("@evmcrispr/module-governor") },
    { name: "proxies", load: () => loadModule("@evmcrispr/module-proxies") },
    { name: "http", load: () => loadModule("@evmcrispr/module-http") },
    { name: "safe", load: () => loadModule("@evmcrispr/module-safe") },
    { name: "swaps", load: () => loadModule("@evmcrispr/module-swaps") },
    { name: "lang", load: () => loadModule("@evmcrispr/module-lang") },
    {
      name: "assertions",
      load: () => loadModule("@evmcrispr/module-assertions"),
    },
  );
}
