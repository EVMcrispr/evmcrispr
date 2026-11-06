import type { ChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts and docs read this file without loading
// the module. The ERC-8421 alternative-mempool devnet is the only network
// that accepts EIP-8141 frame transactions today; its chain id is 1337 (viem
// also names 1337 `localhost`, which no host list relies on). Ephemeral
// network; it may be reset.
//
// The explorer is declared: the CLI links to it when a receipt does not
// arrive. (`registerChains` also derives an explorer API from it; nothing
// here calls one.)
export const chains: ChainDef[] = [
  {
    id: 1337,
    key: "altMempool",
    name: "Alt-mempool devnet",
    rpcUrl: "https://altmempoolgateway.forshtat.com/rpc",
    explorerUrl: "https://explorer.altmempool.wtf",
    testnet: true,
  },
];
