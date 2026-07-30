import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  createTestServer,
  http,
  passthrough,
} from "@evmcrispr/test-utils/msw/server";
import { noirArtifactHandlers } from "./fixtures/msw-handlers";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "noir", load: () => import("../src/index") });
// contracts and sim are needed by the verifier-deploy lifecycle test.
evml.use(
  { name: "contracts", load: () => import("@evmcrispr/module-contracts") },
  { name: "sim", load: () => import("@evmcrispr/module-sim") },
);

export const server = createTestServer(
  ...noirArtifactHandlers,
  // The verifier lifecycle test compiles the generated Solidity through
  // the real solc binary (contracts-module precedent), and Barretenberg
  // downloads its SRS points on first proof.
  http.get("https://binaries.soliditylang.org/*", () => passthrough()),
  http.get("https://crs.aztec-labs.com/*", () => passthrough()),
  http.get("https://crs.aztec-cdn.foundation/*", () => passthrough()),
);
server.listen({ onUnhandledRequest: "bypass" });
