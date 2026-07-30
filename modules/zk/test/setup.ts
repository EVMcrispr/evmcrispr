import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
import { zkArtifactHandlers } from "./fixtures/msw-handlers";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "zk", load: () => import("../src/index") });
// contracts and sim are needed by the verifier-deploy lifecycle test.
evml.use(
  { name: "contracts", load: () => import("@evmcrispr/module-contracts") },
  { name: "sim", load: () => import("@evmcrispr/module-sim") },
);

export const server = createTestServer(...zkArtifactHandlers);
server.listen({ onUnhandledRequest: "bypass" });
