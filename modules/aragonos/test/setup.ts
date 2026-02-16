import { registerAllModules } from "@evmcrispr/test-utils";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
import { aragonosHandlers } from "./fixtures/msw-handlers";

registerAllModules();

// Create and start MSW server with shared + aragonos handlers
export const server = createTestServer(...aragonosHandlers);
server.listen({ onUnhandledRequest: "bypass" });
