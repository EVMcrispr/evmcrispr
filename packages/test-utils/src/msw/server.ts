import type { RequestHandler } from "msw";
import { setupServer } from "msw/node";
import { blockscoutHandlers } from "./blockscout";
import { contractApiHandlers } from "./contract-api";
import { etherscanHandlers } from "./etherscan";
import { sourcifyHandlers } from "./sourcify";
import { tokenlistHandlers } from "./tokenlist";

export type { RequestHandler } from "msw";
// Re-export msw utilities for handler authoring
export { HttpResponse, http, passthrough } from "msw";

export const sharedHandlers = [
  ...etherscanHandlers,
  ...blockscoutHandlers,
  ...contractApiHandlers,
  ...sourcifyHandlers,
  ...tokenlistHandlers,
];

/**
 * Creates an MSW server with shared handlers (etherscan, blockscout, the
 * EVMcrispr API's contract routes, Sourcify) plus any additional handlers
 * passed in. Each module can compose its own server by passing
 * module-specific handlers.
 */
export function createTestServer(...additionalHandlers: RequestHandler[]) {
  return setupServer(...sharedHandlers, ...additionalHandlers);
}

// Export a pre-configured server with only shared handlers
export const server = createTestServer();
