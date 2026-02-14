// Export all AragonOS test fixtures
export * from "./artifacts";
export * from "./subgraph-data";
export { DAO } from "./mock-dao";
export { DAO as DAO2 } from "./mock-dao-2";
export { DAO as DAO3 } from "./mock-dao-3";
export * from "./mock-app";
export * from "./mock-forwarders";
export { aragonosHandlers } from "./msw-handlers";

// Common test constants
export const EOA_ADDRESS = "0xc125218F4Df091eE40624784caF7F47B9738086f";
