import type { ChainDef } from "@evmcrispr/sdk";

// Deliberately empty. The alt-mempool devnet is chain 1337, the default id of
// local devnets (Ganache, geth --dev, viem's `localhost`): declaring it here
// would register it globally as soon as the module is used and route a local
// 1337 user's signed transactions to the third-party gateway instead of their
// node. Only the terminal's frame handler talks to the gateway, through
// `@evmcrispr/viem-frames`, and only when experimental features are on.
export const chains: ChainDef[] = [];
