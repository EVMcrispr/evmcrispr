import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "math", load: () => import("../src/index") });
