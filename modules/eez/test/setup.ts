import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
import { chains } from "../src/chains";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "eez", load: () => import("../src/index"), chains });
// The end-to-end demo compiles a circuit and Solidity inline; the Safe
// examples run a cross-chain assertion through a Safe.
evml.use(
  { name: "contracts", load: () => import("@evmcrispr/module-contracts") },
  { name: "circom", load: () => import("@evmcrispr/module-circom") },
  { name: "safe", load: () => import("@evmcrispr/module-safe") },
);

export const server = createTestServer();
server.listen({ onUnhandledRequest: "bypass" });
