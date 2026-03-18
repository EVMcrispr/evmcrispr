import { registerAllModules } from "@evmcrispr/test-utils";
import { createTestServer } from "@evmcrispr/test-utils/msw/server";

registerAllModules();

export const server = createTestServer();
server.listen({ onUnhandledRequest: "bypass" });
