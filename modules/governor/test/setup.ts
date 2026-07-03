import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";

registerAllModules();
// Re-register with local loaders: the registry's own dynamic imports
// resolve from test-utils, whose isolated node_modules doesn't link these
// packages. access-control is needed by cross-module propose tests.
evml.use(
  { name: "governor", load: () => import("../src/index") },
  {
    name: "access-control",
    load: () => import("@evmcrispr/module-access-control"),
  },
);

// Create and start MSW server
export const server = createTestServer();
server.listen({ onUnhandledRequest: "bypass" });
