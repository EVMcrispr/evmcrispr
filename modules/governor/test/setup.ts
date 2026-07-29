import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";

registerAllModules();
// Re-register with local loaders: the registry's own dynamic imports
// resolve from test-utils, whose isolated node_modules doesn't link these
// packages. acl is needed by cross-module propose tests.
evml.use(
  { name: "governor", load: () => import("../src/index") },
  {
    name: "acl",
    load: () => import("@evmcrispr/module-acl"),
  },
);

// Create and start MSW server
export const server = createTestServer();
server.listen({ onUnhandledRequest: "bypass" });
