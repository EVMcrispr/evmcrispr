import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
import { gelatoHandlers } from "./fixtures/msw-handlers";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "gelato", load: () => import("../src/index") });

export const server = createTestServer();
server.listen({ onUnhandledRequest: "bypass" });
// Runtime handlers take precedence over the shared ones: the Polygon
// tokenlist below must win over test-utils' one-list-for-every-chain mock.
server.use(...gelatoHandlers);
