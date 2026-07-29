import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use(
  { name: "vault", load: () => import("../src/index") },
  // contracts is needed by the mock-vault deploy in the 7540 lifecycle test.
  {
    name: "contracts",
    load: () => import("@evmcrispr/module-contracts"),
  },
);
