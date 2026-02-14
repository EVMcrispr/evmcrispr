import type { RequestHandler } from "msw";
import { setupServer } from "msw/node";
import { blockscoutHandlers } from "./blockscout";
import { etherscanHandlers } from "./etherscan";

export type { RequestHandler } from "msw";
// Re-export msw utilities for handler authoring
export { HttpResponse, http } from "msw";

export const sharedHandlers = [...etherscanHandlers, ...blockscoutHandlers];

/**
 * Creates an MSW server with shared handlers (etherscan, blockscout) plus
 * any additional handlers passed in. Each module can compose its own server
 * by passing module-specific handlers.
 */
export function createTestServer(...additionalHandlers: RequestHandler[]) {
  return setupServer(...sharedHandlers, ...additionalHandlers);
}

// Export a pre-configured server with only shared handlers
export const server = createTestServer();
