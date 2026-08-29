import type { ChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts and docs read this file without loading
// the module. Both chains are the EEZ team's hosted devnet, reached through
// EVMcrispr's `experimental-eez-rpc`: one ordinary JSON-RPC per chain that
// forwards to the devnet's execution RPC and hands cross-chain transactions
// (the ones that would revert with `ExecutionNotFound()` outside a composed
// sync block) to the EEZ cross-chain ingress instead, estimating their gas
// too. Ephemeral networks; they may be reset.
export const chains: ChainDef[] = [
  {
    id: 7331,
    key: "eezL1",
    name: "EEZ L1",
    rpcUrl: "https://api.evmcrispr.com/experimental-eez-rpc/eezL1",
    explorerUrl: "http://91.134.73.215:4000",
    // The Blockscout backend runs beside the frontend on this host.
    explorerApiUrl: "http://91.134.73.215:4001/api",
    testnet: true,
  },
  {
    id: 6290,
    key: "eezL2",
    name: "EEZ L2",
    rpcUrl: "https://api.evmcrispr.com/experimental-eez-rpc/eezL2",
    explorerUrl: "http://65.109.26.16:8088",
    testnet: true,
  },
];
