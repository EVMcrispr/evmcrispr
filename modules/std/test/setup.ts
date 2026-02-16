import { registerAllModules } from "@evmcrispr/test-utils";
import {
  createTestServer,
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";
import tokenList from "./fixtures/tokenlist/uniswap.json";

registerAllModules();

// Std-specific MSW handlers
const stdHandlers = [
  http.get("https://tokens.uniswap.org/", () => HttpResponse.json(tokenList)),
];

// Create and start MSW server with shared + std handlers
export const server = createTestServer(...stdHandlers);
server.listen({ onUnhandledRequest: "bypass" });
