import { registerAllModules } from "@evmcrispr/test-utils";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";

registerAllModules();

// Create and start MSW server
export const server = createTestServer();
server.listen({ onUnhandledRequest: "bypass" });
