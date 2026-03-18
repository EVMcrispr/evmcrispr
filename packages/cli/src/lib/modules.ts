import { EVMcrispr } from "@evmcrispr/core";

export function registerAllModules(): void {
  EVMcrispr.registerModule(
    "aragonos",
    () => import("@evmcrispr/module-aragonos"),
  );
  EVMcrispr.registerModule("sim", () => import("@evmcrispr/module-sim"));
  EVMcrispr.registerModule("giveth", () => import("@evmcrispr/module-giveth"));
  EVMcrispr.registerModule("ens", () => import("@evmcrispr/module-ens"));
  EVMcrispr.registerModule("http", () => import("@evmcrispr/module-http"));
  EVMcrispr.registerModule("lang", () => import("@evmcrispr/module-lang"));
}
