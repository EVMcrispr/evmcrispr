import { EVMcrispr } from "@evmcrispr/core";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
// Import aragonos handlers since giveth tests use aragonos:connect
import { aragonosHandlers } from "../../aragonos/test/fixtures/msw-handlers";

// Register modules that may be used in giveth tests
EVMcrispr.registerModule(
  "aragonos",
  () => import("@evmcrispr/module-aragonos"),
);
EVMcrispr.registerModule("sim", () => import("@evmcrispr/module-sim"));
EVMcrispr.registerModule("giveth", () => import("@evmcrispr/module-giveth"));
EVMcrispr.registerModule("ens", () => import("@evmcrispr/module-ens"));

// Create and start MSW server with shared + aragonos handlers
// (Giveth tests use aragonos:connect which needs subgraph mocking)
export const server = createTestServer(...aragonosHandlers);
server.listen({ onUnhandledRequest: "bypass" });
