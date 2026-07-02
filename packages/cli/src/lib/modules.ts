import { evml } from "@evmcrispr/core";

export function registerAllModules(): void {
  evml.use(
    { name: "aragonos", load: () => import("@evmcrispr/module-aragonos") },
    { name: "sim", load: () => import("@evmcrispr/module-sim") },
    { name: "giveth", load: () => import("@evmcrispr/module-giveth") },
    { name: "ens", load: () => import("@evmcrispr/module-ens") },
    { name: "http", load: () => import("@evmcrispr/module-http") },
    { name: "lang", load: () => import("@evmcrispr/module-lang") },
    { name: "assertions", load: () => import("@evmcrispr/module-assertions") },
  );
}
