import type { ChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts, docs and scripts/frame-devnet.ts read this
// file without loading the module.
//
// The public alt-mempool devnet is chain 1337, the default id of local
// devnets (Ganache, geth --dev, viem's `localhost`): declaring it here would
// register it globally as soon as the module is used and route a local 1337
// user's signed transactions to the third-party gateway instead of their
// node. It is not declared; only the terminal's frame handler talks to its
// gateway, through `@evmcrispr/viem-frames`, with experimental features on.
//
// The two local frame devnets `scripts/frame-devnet.ts` starts are declared,
// with chain ids of their own (set in the genesis they are started with, and
// free in viem and in ethereum-lists/chains on 2026-11-08), so `switch` reaches
// them and they never stand for another network. Their RPCs are on this
// machine, at fixed ports; a host can still override them per chain id.
export const chains: ChainDef[] = [
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
];
