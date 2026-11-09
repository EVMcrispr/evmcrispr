// Where a frame transaction is sent, by chain: the chains that run EIP-8141.
// A host overrides a network's RPC through its transport for that chain (the
// terminal's RPC settings; its transport for the Alt-mempool devnet is the
// gateway).
import {
  altMempoolDevnet,
  eip8141TracerProfile,
  withFrames,
} from "@evmcrispr/viem-frames";
import { type Chain, defineChain } from "viem";
import { chains } from "./chains";

export interface FrameNetwork {
  /** A chain from viem-frames' `withFrames`: its profile, and whether its RPC is an ERC-8421 sidecar (the alt mempool). */
  chain: Chain;
  /** What `switch` takes to reach it. */
  switchTo: string;
  /** false: the chain admits transactions but never mines them. */
  mines: boolean;
}

const local = (key: string, mines: boolean): FrameNetwork => {
  const def = chains.find((c) => c.key === key)!;
  return {
    chain: withFrames(
      defineChain({
        id: def.id,
        name: def.name,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [def.rpcUrl] } },
        testnet: true,
      }),
      { profile: eip8141TracerProfile, sidecar: false },
    ),
    switchTo: def.key,
    mines,
  };
};

export const frameNetworks: readonly FrameNetwork[] = [
  {
    chain: altMempoolDevnet,
    switchTo: String(altMempoolDevnet.id),
    mines: true,
  },
  local("framesQuick", false),
  local("framesMining", true),
];

export function frameNetwork(chainId: number): FrameNetwork | undefined {
  return frameNetworks.find((n) => n.chain.id === chainId);
}

/** "the A, the B or the C". */
export function frameNetworkNames(): string {
  const names = frameNetworks.map((n) => `the ${n.chain.name}`);
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}
