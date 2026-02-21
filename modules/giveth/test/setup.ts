import { registerAllModules } from "@evmcrispr/test-utils";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";
// Import aragonos handlers since giveth tests use aragonos:connect
import { aragonosHandlers } from "../../aragonos/test/fixtures/msw-handlers";
import { givethIpfsHandlers } from "./fixtures/msw-handlers";

registerAllModules();

// Create and start MSW server with shared + aragonos + giveth IPFS handlers
export const server = createTestServer(
  ...aragonosHandlers,
  ...givethIpfsHandlers,
);
server.listen({ onUnhandledRequest: "bypass" });
