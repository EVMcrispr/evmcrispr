import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  createTestServer,
  http,
  passthrough,
} from "@evmcrispr/test-utils/msw/server";
import { zkArtifactHandlers } from "./fixtures/msw-handlers";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "circom", load: () => import("../src/index") });
// contracts and sim are needed by the verifier-deploy lifecycle test.
evml.use(
  { name: "contracts", load: () => import("@evmcrispr/module-contracts") },
  { name: "sim", load: () => import("@evmcrispr/module-sim") },
);

export const server = createTestServer(
  ...zkArtifactHandlers,
  // The verifier lifecycle test compiles the exported Solidity through the
  // real solc binary (contracts-module precedent).
  http.get("https://binaries.soliditylang.org/*", () => passthrough()),
);
server.listen({ onUnhandledRequest: "bypass" });
