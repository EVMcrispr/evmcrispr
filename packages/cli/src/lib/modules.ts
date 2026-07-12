import { evml } from "@evmcrispr/core";

export function registerAllModules(): void {
  evml.use(
    { name: "aragonos", load: () => import("@evmcrispr/module-aragonos") },
    { name: "sim", load: () => import("@evmcrispr/module-sim") },
    { name: "giveth", load: () => import("@evmcrispr/module-giveth") },
    { name: "ens", load: () => import("@evmcrispr/module-ens") },
    { name: "token", load: () => import("@evmcrispr/module-token") },
    {
      name: "access-control",
      load: () => import("@evmcrispr/module-access-control"),
    },
    { name: "governor", load: () => import("@evmcrispr/module-governor") },
    { name: "proxies", load: () => import("@evmcrispr/module-proxies") },
    { name: "http", load: () => import("@evmcrispr/module-http") },
    { name: "safe", load: () => import("@evmcrispr/module-safe") },
    { name: "swaps", load: () => import("@evmcrispr/module-swaps") },
    { name: "bridges", load: () => import("@evmcrispr/module-bridges") },
    { name: "lang", load: () => import("@evmcrispr/module-lang") },
    { name: "assertions", load: () => import("@evmcrispr/module-assertions") },
  );
}
