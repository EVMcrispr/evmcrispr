import type { ChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts and docs read this file without loading
// the module. These are the EEZ team's hosted Rollup 0 devnet (execution
// RPCs — cross-chain transactions go through the ingress fronts, see
// `constants.ts`). Both chains are ephemeral and may be reset.
export const chains: ChainDef[] = [
  {
    id: 7331,
    name: "EEZ Devnet L1",
    rpcUrl: "http://91.134.73.215:8545",
    explorerUrl: "http://91.134.73.215:4000",
    testnet: true,
  },
  {
    id: 6290,
    name: "EEZ Devnet L2",
    rpcUrl: "http://65.109.26.16:18688",
    explorerUrl: "http://65.109.26.16:8088",
    testnet: true,
  },
];
