import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
import { bridgeServiceHandlers } from "./fixtures/msw-handlers";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "bridges", load: () => import("../src/index") });

// Create and start MSW server with shared + Across/Circle/LayerZero handlers
export const server = createTestServer(...bridgeServiceHandlers);
server.listen({ onUnhandledRequest: "bypass" });
