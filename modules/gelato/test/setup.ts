import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
import { gelatoHandlers, TEST_RUNNER_CID } from "./fixtures/msw-handlers";

// The runner the tests schedule with: served by the mocked function store.
process.env.EVMCRISPR_RUNNER_CID = TEST_RUNNER_CID;

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
