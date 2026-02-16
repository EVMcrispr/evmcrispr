import { registerAllModules } from "@evmcrispr/test-utils";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
// Import aragonos handlers since giveth tests use aragonos:connect
import { aragonosHandlers } from "../../aragonos/test/fixtures/msw-handlers";

registerAllModules();

// Create and start MSW server with shared + aragonos handlers
// (Giveth tests use aragonos:connect which needs subgraph mocking)
export const server = createTestServer(...aragonosHandlers);
server.listen({ onUnhandledRequest: "bypass" });
