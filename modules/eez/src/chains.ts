import type { ChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts and docs read this file without loading
// the module. Both chains are the EEZ Team's hosted devnet, reached through
// EVMcrispr's `experimental-eez-rpc`: one ordinary JSON-RPC per chain that
// forwards to the devnet's execution RPC and hands cross-chain transactions
// (the ones that would revert with `ExecutionNotFound()` outside a composed
// sync block) to the EEZ cross-chain ingress instead, estimating their gas
// too. Ephemeral networks; they may be reset.
//
// No explorer is declared: the devnet's Blockscout frontends are reachable
// but its API backend is not, and `registerChains` derives an explorer API
// from `explorerUrl` when one is omitted — which would aim `contracts:verify`
// at a frontend that answers HTML.
export const chains: ChainDef[] = [
  {
    id: 7331,
    key: "eezL1",
    name: "EEZ L1",
    rpcUrl: "https://api.evmcrispr.com/experimental-eez-rpc/eezL1",
    testnet: true,
  },
  {
    id: 6290,
    key: "eezL2",
    name: "EEZ L2",
    rpcUrl: "https://api.evmcrispr.com/experimental-eez-rpc/eezL2",
    testnet: true,
  },
];
