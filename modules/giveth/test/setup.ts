import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
import { givethGraphqlHandlers } from "./fixtures/msw-handlers";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package. Same for superfluid (a devDependency), which the anchor helper's
// recurring-donation docCase loads.
evml.use({ name: "giveth", load: () => import("../src/index") });
evml.use({
  name: "superfluid",
  load: () => import("@evmcrispr/module-superfluid"),
});

// Create and start MSW server with shared + Giveth GraphQL handlers
export const server = createTestServer(...givethGraphqlHandlers);
server.listen({ onUnhandledRequest: "bypass" });
