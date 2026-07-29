import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";

registerAllModules();
// Re-register contracts with a local loader: the registry's own dynamic
// import resolves from test-utils, whose isolated node_modules doesn't
// link that package. Needed by the @contracts:codeAt/storageAt checks.
evml.use({
  name: "contracts",
  load: () => import("@evmcrispr/module-contracts"),
});
// token (a devDependency) backs the @token:balance checks in backend tests.
evml.use({
  name: "token",
  load: () => import("@evmcrispr/module-token"),
});

// Create and start MSW server
export const server = createTestServer();
server.listen({ onUnhandledRequest: "bypass" });
