import type { ChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts and docs read this file without loading
// the module. The EEZ Team's hosted devnet settles on Gnosis Chiado (chain id
// 10200, a chain viem already knows as `gnosisChiado`, so it is not declared
// here); its rollup is declared below, reached through the EEZ composer: an
// ordinary JSON-RPC that also takes cross-chain transactions and composes
// them with the rollup's execution. It cannot estimate the gas of a
// cross-chain call, so `eez:on`/`eez:batch` size their own gas and other
// commands take `--gas`. Ephemeral network; it may be reset.
//
// No explorer is declared: the devnet's Blockscout frontends are reachable
// but its API backend is not, and `registerChains` derives an explorer API
// from `explorerUrl` when one is omitted — which would aim `contracts:verify`
// at a frontend that answers HTML.
export const chains: ChainDef[] = [
  {
    id: 6291,
    key: "eezL2",
    name: "EEZ L2",
    rpcUrl: "https://eez.asuscomm.com/composer/l2",
    testnet: true,
  },
];
