import { EVMcrispr } from "@evmcrispr/core";
import {
  createTestServer,
  http,
  HttpResponse,
} from "@evmcrispr/test-utils/msw/server";
import tokenList from "./fixtures/tokenlist/uniswap.json";

// Register modules that may be used in std tests
EVMcrispr.registerModule(
  "aragonos",
  () => import("@evmcrispr/module-aragonos"),
);
EVMcrispr.registerModule("sim", () => import("@evmcrispr/module-sim"));
EVMcrispr.registerModule("giveth", () => import("@evmcrispr/module-giveth"));
EVMcrispr.registerModule("ens", () => import("@evmcrispr/module-ens"));

// Std-specific MSW handlers
const stdHandlers = [
  http.get("https://tokens.uniswap.org/", () => HttpResponse.json(tokenList)),
];

// Create and start MSW server with shared + std handlers
export const server = createTestServer(...stdHandlers);
server.listen({ onUnhandledRequest: "bypass" });
