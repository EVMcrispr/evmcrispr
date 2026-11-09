// Where a frame transaction is sent, by chain: the chains that run EIP-8141.
// A host overrides a network's RPC through its transport for that chain (the
// terminal's RPC settings; its transport for the Alt-mempool devnet is the
// gateway).
import {
  altMempoolDevnet,
  eip8141TracerProfile,
  frameProfileOf,
  hegotaDevnet,
  withFrames,
} from "@evmcrispr/viem-frames";
import { type Chain, defineChain } from "viem";
import { chains } from "./chains";

/** How a network's client charges a frame's own gas, as `sim:fork`
 *  models it (both measured on the chains). */
export interface FrameGasRules {
  /** What a frame pays out of its gas to reach its target (EIP-2929). */
  targetAccess: { warm: bigint; cold: bigint };
  /** A frame whose target has no code, or is a precompile, uses none of
   *  its own gas: the client charges it to the transaction instead. */
  codelessFramesFree: boolean;
  /** The payer is charged its maximum cost (max fee × the intrinsic gas
   *  and every frame's limits) when it approves, and refunded what the
   *  transaction did not use after its last frame (EIP-8141's max_cost).
   *  The gas used is the intrinsic gas and the frames', or the calldata
   *  floor when that is more. `extraBytes`: bytes the client counts on top
   *  of the transaction's, priced as non-zero in both. */
  preCharge?: { extraBytes: bigint };
  /** Every value transfer to another account emits EIP-7708's log. */
  transferLogs?: boolean;
  /** The client's gas schedule for frames, when it is not the forked
   *  chain's: "hegota" is Amsterdam with EIP-8038's access costs and
   *  EIP-8037's state gas, drawn from each frame's `limits.state`. */
  schedule?: "hegota";
}

/** ethrex `eip8141-tracer` (the alt-mempool and local devnets), measured on
 *  `up quick` on 2026-11-09. */
const TRACER_GAS: FrameGasRules = {
  targetAccess: { warm: 100n, cold: 3_000n },
  codelessFramesFree: false,
};

/** ethrex `hegota-devnet`, measured on the chain on 2026-11-09: a target
 *  with code ran with a 20-gas limit, a precompile and a transfer with 1;
 *  a POST_TX frame saw the payer charged the transaction's maxCost, whose
 *  intrinsic gas is EIP-8141's with 3 more bytes (hegota-post-tx-probe
 *  (e), (f)); the gas used is at least the calldata floor (j);
 *  value transfers emit EIP-7708's logs, as the EIP lays them out (g). */
const HEGOTA_GAS: FrameGasRules = {
  targetAccess: { warm: 0n, cold: 0n },
  codelessFramesFree: true,
  preCharge: { extraBytes: 3n },
  transferLogs: true,
  schedule: "hegota",
};

export interface FrameNetwork {
  /** A chain from viem-frames' `withFrames`: its profile, and whether its RPC is an ERC-8421 sidecar (the alt mempool). */
  chain: Chain;
  /** What `switch` takes to reach it. */
  switchTo: string;
  /** false: the chain admits transactions but never mines them. */
  mines: boolean;
  gas: FrameGasRules;
}

const local = (key: string, mines: boolean, sidecar = false): FrameNetwork => {
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
      { profile: eip8141TracerProfile, sidecar },
    ),
    switchTo: def.key,
    mines,
    gas: TRACER_GAS,
  };
};

export const frameNetworks: readonly FrameNetwork[] = [
  {
    chain: altMempoolDevnet,
    switchTo: "altMempoolDevnet",
    mines: true,
    gas: TRACER_GAS,
  },
  local("framesQuick", false),
  local("framesMining", true),
  local("framesAltMempool", true, true),
  {
    chain: hegotaDevnet,
    switchTo: "hegotaDevnet",
    mines: true,
    gas: HEGOTA_GAS,
  },
];

/** Whether the network's client runs POST_TX frames (`post-verify`). */
export function isPostTxNetwork(chainId: number): boolean {
  const network = frameNetwork(chainId);
  return (
    network !== undefined &&
    frameProfileOf(network.chain).frameModes.POST_TX !== undefined
  );
}

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
