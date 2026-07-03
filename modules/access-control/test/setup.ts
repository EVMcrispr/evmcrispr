import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "access-control", load: () => import("../src/index") });

// Create and start MSW server
export const server = createTestServer();
server.listen({ onUnhandledRequest: "bypass" });
