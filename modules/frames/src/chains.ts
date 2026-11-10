import type { ChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts, docs and scripts/frame-devnet.ts read this
// file without loading the module.
//
// The two public frame devnets share their chain ids with local tooling:
// 1337 is Ganache's, geth --dev's and viem's `localhost`; 3151908 is
// Kurtosis' default. They are declared with `sharedId`, so a node on either
// id is the public devnet only where its block 0 is the declared RPC's:
// hosts never take a local node for it, nor read a local chain through it.
//
// The two local frame devnets `scripts/frame-devnet.ts` starts are declared,
// with chain ids of their own (set in the genesis they are started with, and
// free in viem and in ethereum-lists/chains on 2026-11-08), so `switch` reaches
// them and they never stand for another network. Their RPCs are on this
// machine, at fixed ports; a host can still override them per chain id.
export const chains: ChainDef[] = [
  {
    // docs.altmempool.wtf/guides/devnet: ethrex eip8141-tracer and the
    // ERC-8421 sidecar, whose RPC this is (the node is at the bare host).
    id: 1337,
    key: "altMempoolDevnet",
    name: "Alt-mempool devnet",
    rpcUrl: "https://altmempool.forshtat.com/rpc",
    explorerUrl: "https://explorer.altmempool.wtf",
    testnet: true,
    sharedId: true,
  },
  {
    // lambdaclass/ethrex hegota-devnet, scripts/hegota-devnet/USER-GUIDE.md:
    // frame transactions with EIP-7906 assertions (also rpc2, rpc3).
    id: 3151908,
    key: "hegotaDevnet",
    name: "Hegota devnet",
    rpcUrl: "https://rpc1.hegota.ethrex.xyz",
    explorerUrl: "https://dora.hegota.ethrex.xyz",
    testnet: true,
    sharedId: true,
  },
  {
    // `up quick`: one ethrex container. Answers reads and simulations, and
    // admits transactions, but never mines.
    id: 81411,
    key: "framesQuick",
    name: "Frames quick devnet",
    rpcUrl: "http://127.0.0.1:8570",
    testnet: true,
  },
  {
    // `up mining`: ethrex and Lighthouse in Kurtosis. Mines; frame
    // transactions are valid from about 7 minutes after it starts.
    id: 81412,
    key: "framesMining",
    name: "Frames mining devnet",
    rpcUrl: "http://127.0.0.1:32003",
    testnet: true,
  },
  {
    // `up altmempool`: the mining devnet's stack on a chain of its own, with
    // the ERC-8421 sidecar in front (as on the public alt-mempool devnet):
    // its RPC is the sidecar's, which passes reads on to ethrex.
    id: 81413,
    key: "framesAltMempool",
    name: "Frames alt-mempool devnet",
    rpcUrl: "http://127.0.0.1:14337/rpc",
    testnet: true,
  },
];
