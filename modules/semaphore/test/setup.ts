import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  createTestServer,
  http,
  passthrough,
} from "@evmcrispr/test-utils/msw/server";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "semaphore", load: () => import("../src/index") });
evml.use(
  { name: "zk", load: () => import("@evmcrispr/module-zk") },
  { name: "contracts", load: () => import("@evmcrispr/module-contracts") },
  { name: "sim", load: () => import("@evmcrispr/module-sim") },
);

export const server = createTestServer(
  // The real ceremony artifacts are a live dependency, prewarmed once per
  // run (heavy-real-binary precedent: the solc CDN passthrough in zk).
  http.get("https://snark-artifacts.pse.dev/*", () => passthrough()),
);
server.listen({ onUnhandledRequest: "bypass" });
