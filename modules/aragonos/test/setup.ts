import { EVMcrispr } from "@evmcrispr/core";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
import { aragonosHandlers } from "./fixtures/msw-handlers";

// Register modules that may be used in aragonos tests
EVMcrispr.registerModule(
  "aragonos",
  () => import("@evmcrispr/module-aragonos"),
);
EVMcrispr.registerModule("sim", () => import("@evmcrispr/module-sim"));
EVMcrispr.registerModule("giveth", () => import("@evmcrispr/module-giveth"));
EVMcrispr.registerModule("ens", () => import("@evmcrispr/module-ens"));

// Create and start MSW server with shared + aragonos handlers
export const server = createTestServer(...aragonosHandlers);
server.listen({ onUnhandledRequest: "bypass" });
