import { EVMcrispr } from "@evmcrispr/core";

/**
 * Register all available EVMcrispr modules. Call once per test setup file.
 */
export function registerAllModules(): void {
  EVMcrispr.registerModule(
    "aragonos",
    () => import("@evmcrispr/module-aragonos"),
  );
  EVMcrispr.registerModule("sim", () => import("@evmcrispr/module-sim"));
  EVMcrispr.registerModule("giveth", () => import("@evmcrispr/module-giveth"));
  EVMcrispr.registerModule("ens", () => import("@evmcrispr/module-ens"));
}
