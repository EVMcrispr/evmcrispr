import { EVMcrispr } from "@evmcrispr/core";

const loadModule = (moduleName: string) => import(moduleName);

/**
 * Register all available EVMcrispr modules. Call once per test setup file.
 */
export function registerAllModules(): void {
  EVMcrispr.registerModule("aragonos", () =>
    loadModule("@evmcrispr/module-aragonos"),
  );
  EVMcrispr.registerModule("sim", () => loadModule("@evmcrispr/module-sim"));
  EVMcrispr.registerModule("giveth", () =>
    loadModule("@evmcrispr/module-giveth"),
  );
  EVMcrispr.registerModule("ens", () => loadModule("@evmcrispr/module-ens"));
  EVMcrispr.registerModule("http", () => loadModule("@evmcrispr/module-http"));
  EVMcrispr.registerModule("lang", () => loadModule("@evmcrispr/module-lang"));
  EVMcrispr.registerModule("assertions", () =>
    loadModule("@evmcrispr/module-assertions"),
  );
}
