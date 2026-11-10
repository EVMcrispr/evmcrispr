import { profile as tracer } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { toWire } from "@forshtat/hegota-support/rpc";
import {
  type Address,
  type Chain,
  type Client,
  defineChain,
  defineTransactionReceipt,
  formatLog,
  type Hex,
} from "viem";
import { parseAccount } from "viem/accounts";
import { estimateFeesPerGas, getCode, getTransactionCount } from "viem/actions";
import { ethrexHegotaDevnetProfile } from "./profiles";
import { frameSerializer, toFrameTx } from "./serializer";
import type {
  Frame,
  FrameReceipt,
  FrameRequest,
  FrameTransactionReceiptFields,
  Profile,
} from "./types";

/** The public alt-mempool devnet's gateway: the Skandha sidecar, which forwards chain reads to ethrex (docs.altmempool.wtf/guides/devnet). */
export const ALT_MEMPOOL_GATEWAY = "https://altmempool.forshtat.com/rpc";
/** The devnet's ethrex node (the miner), which serves `ethrex_simulateFrameTransaction`. */
export const ALT_MEMPOOL_NODE = "https://altmempool.forshtat.com";
/** The public Hegota devnet's ethrex node: a plain node (no sidecar) that also serves `ethrex_simulateFrameTransaction`. */
export const HEGOTA_DEVNET_RPC = "https://rpc1.hegota.ethrex.xyz";

interface RpcFrameReceipt {
  status: Hex;
  gasUsed: Hex;
  stateGasUsed?: Hex;
  logs: Parameters<typeof formatLog>[0][];
}

const FRAME_STATUS: Record<string, FrameReceipt["status"]> = {
  "0x0": "reverted",
  "0x1": "success",
  "0x2": "skipped",
};

/** Adds `payer` and per-frame receipts to viem's receipt, and names type `0x6` `frame`. */
const transactionReceipt = defineTransactionReceipt({
  format(args: {
    type?: Hex | string;
    payer?: Address;
    frameReceipts?: RpcFrameReceipt[];
  }): FrameTransactionReceiptFields & { type?: string } {
    if (args.type !== "0x6" && !args.frameReceipts) return {};
    return {
      type: "frame",
      payer: args.payer,
      frameReceipts: args.frameReceipts?.map((r) => ({
        status: FRAME_STATUS[r.status] ?? "reverted",
        gasUsed: BigInt(r.gasUsed),
        stateGasUsed: BigInt(r.stateGasUsed ?? "0x0"),
        logs: r.logs.map((log) => formatLog(log)),
      })),
    };
  },
});

type PrepareArgs = Record<string, unknown> & {
  account?: unknown;
  from?: Address;
  chain?: Chain;
  chainId?: number;
  nonce?: number;
  frames?: readonly FrameRequest[];
  nonceKeys?: readonly bigint[];
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
};

/** Hex strings or numbers from the sidecar, as bigints. */
const big = (x: unknown): bigint => BigInt(x as string);

/**
 * Fills a frame transaction before viem tries to: nonce, fees, every frame's
 * limits and a `gas` total, so viem neither calls `eth_fillTransaction` nor
 * `eth_estimateGas`, neither of which can describe frames.
 */
async function prepareFrameRequest(
  args: PrepareArgs,
  { client }: { client: Client },
  { profile }: { profile: Profile },
): Promise<PrepareArgs> {
  if (!args.frames) return args;
  const sender =
    args.from ??
    (args.account ? parseAccount(args.account as Address).address : undefined);
  if (!sender) throw new Error("A frame transaction needs an account");
  const chainId = args.chainId ?? args.chain?.id ?? client.chain?.id;
  if (chainId === undefined)
    throw new Error("A frame transaction needs a chain");

  const nonce =
    args.nonce ??
    (await getTransactionCount(client, {
      address: sender,
      blockTag: "pending",
    }));

  let { maxFeePerGas, maxPriorityFeePerGas } = args;
  if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined) {
    const fees = await sidecarGasPrice(client).catch(() =>
      estimateFeesPerGas(client),
    );
    maxFeePerGas ??= fees.maxFeePerGas;
    maxPriorityFeePerGas ??= fees.maxPriorityFeePerGas;
  }

  let frames: Frame[];
  if (args.frames.every((f) => f.limits)) {
    frames = args.frames as Frame[];
  } else {
    const request = {
      chainId,
      sender,
      nonce,
      nonceKeys: args.nonceKeys,
      frames: args.frames,
      maxFeePerGas,
      maxPriorityFeePerGas,
      profile,
    };
    // The sidecar's estimate skips signatures, so the protocol's default
    // code (an account without code) cannot approve in it, and the node runs
    // no frame of a transaction whose signature does not authenticate the
    // sender: such a sender's frames carry their own limits.
    const code = await getCode(client, { address: sender });
    if (!code || code === "0x")
      throw new Error(
        "The frames of a sender without code are not estimated (the estimate skips signatures, so the sender's default code cannot approve): give every frame gas and stateGas",
      );
    const limits = (await estimateFrameGas(client, request)).frames;
    frames = args.frames.map((f, i) => ({
      ...f,
      limits: f.limits ?? limits[i]!,
    }));
  }

  return {
    ...args,
    type: "frame",
    chainId,
    nonce,
    frames,
    maxFeePerGas,
    maxPriorityFeePerGas,
    // Unused by the encoding: set so viem does not estimate it.
    gas: frames.reduce(
      (sum, f) => sum + f.limits.execution + f.limits.state,
      0n,
    ),
  };
}

/** `ethrex_simulateFrameTransaction` on an ethrex node (the sidecar does not serve it). */
export async function simulate(
  url: string,
  serializedTransaction: Hex,
  blockTag: string = "latest",
  options?: { trace?: boolean },
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "ethrex_simulateFrameTransaction",
      params: options
        ? [serializedTransaction, blockTag, options]
        : [serializedTransaction, blockTag],
    }),
  });
  const json = (await response.json()) as {
    result?: Record<string, unknown>;
    error?: { message?: string };
  };
  if (json.error || !json.result)
    throw new Error(
      `${url} could not simulate the transaction: ${json.error?.message ?? "no result"}`,
    );
  return json.result;
}

/** The sidecar's fees (`skandha_getGasPrice`): the gateway serves no `eth_feeHistory`. */
export async function sidecarGasPrice(client: Client) {
  const result = (await client.request({
    method: "skandha_getGasPrice",
  } as never)) as { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  return {
    maxFeePerGas: big(result.maxFeePerGas),
    maxPriorityFeePerGas: big(result.maxPriorityFeePerGas),
  };
}

export interface FrameGasEstimate {
  /** Per frame, in order. Validation-prefix frames keep the limits they were sent with. */
  frames: Frame["limits"][];
  cumulativeGasUsed: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** `eth_estimateFrameTransactionGas`: the sidecar simulates the body frames with a generous placeholder limit. */
export async function estimateFrameGas(
  client: Client,
  {
    chainId,
    sender,
    nonce,
    nonceKeys,
    frames,
    maxFeePerGas,
    maxPriorityFeePerGas,
    profile = tracer,
  }: {
    chainId: number;
    sender: Address;
    nonce: number;
    nonceKeys?: readonly bigint[] | undefined;
    frames: readonly FrameRequest[];
    /** The sidecar's own placeholder fee (1 wei) is below a real base fee: pass the fees the transaction will carry. */
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    profile?: Profile | undefined;
  },
): Promise<FrameGasEstimate> {
  const tx = toFrameTx(
    {
      type: "frame",
      chainId,
      from: sender,
      nonce,
      nonceKeys,
      frames: frames.map((f) => ({
        ...f,
        limits: f.limits ?? { execution: 0n, state: 0n },
      })),
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
    profile,
  );
  // Without signatures the sidecar skips signature checks, as an estimate should.
  const { signatures: _, ...partial } = toWire(tx) as Record<string, unknown>;
  const result = (await client.request({
    method: "eth_estimateFrameTransactionGas",
    params: [partial],
  } as never)) as {
    frames: { execution: Hex; state: Hex }[];
    cumulativeGasUsed: Hex;
    maxFeePerGas: Hex;
    maxPriorityFeePerGas: Hex;
  };
  return {
    frames: result.frames.map((f) => ({
      execution: big(f.execution),
      state: big(f.state),
    })),
    cumulativeGasUsed: big(result.cumulativeGasUsed),
    maxFeePerGas: big(result.maxFeePerGas),
    maxPriorityFeePerGas: big(result.maxPriorityFeePerGas),
  };
}

/**
 * Teaches `chain` frame transactions, the way `viem/tempo` teaches Tempo's:
 * its serializer encodes them, its receipt formatter reads per-frame
 * receipts, and a prepare hook fills them. A request with `frames` then goes
 * through viem's own `sendTransaction` and `signTransaction` (local accounts),
 * to the canonical mempool. `altMempoolActions` sends to the alt mempool.
 */
export function withFrames<const chain extends Chain>(
  chain: chain,
  {
    profile = tracer,
    simulationUrl,
    sidecar = false,
  }: {
    profile?: Profile;
    /** An ethrex node serving `ethrex_simulateFrameTransaction` (the sidecar does not). */
    simulationUrl?: string;
    /** The chain's RPC is an ERC-8421 sidecar (`skandha_*` methods: fees, status), not a plain node. */
    sidecar?: boolean;
  } = {},
): chain {
  // The prepare hook is typed `never` to get past viem's request type, which
  // knows no `frames`; the result is the chain it was given, with more hooks.
  return defineChain({
    ...chain,
    custom: {
      ...chain.custom,
      frameProfile: profile,
      frameSimulationUrl: simulationUrl,
      frameSidecar: sidecar,
    },
    formatters: { ...chain.formatters, transactionReceipt },
    serializers: {
      ...chain.serializers,
      transaction: frameSerializer(profile),
    },
    prepareTransactionRequest: [
      ((args: PrepareArgs, options: { client: Client }) =>
        prepareFrameRequest(args, options, { profile })) as never,
      { runAt: ["beforeFillTransaction"] },
    ],
  }) as unknown as chain;
}

/** The simulation node a chain was given by `withFrames`. */
export function frameSimulationUrlOf(
  chain: Chain | undefined,
): string | undefined {
  return chain?.custom?.frameSimulationUrl as string | undefined;
}

/** Whether a chain's RPC is an ERC-8421 sidecar, as `withFrames` was told. */
export function frameSidecarOf(chain: Chain | undefined): boolean {
  return chain?.custom?.frameSidecar === true;
}

/** The profile a chain was given by `withFrames`. */
export function frameProfileOf(chain: Chain | undefined): Profile {
  return (chain?.custom?.frameProfile as Profile | undefined) ?? tracer;
}

/** The public EIP-8141 / ERC-8421 devnet (chain 1337) that the alt-mempool workshop runs on. */
export const altMempoolDevnet = withFrames(
  defineChain({
    id: 1337,
    name: "Alt-mempool devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [ALT_MEMPOOL_GATEWAY] } },
    blockExplorers: {
      default: {
        name: "Alt mempool explorer",
        url: "https://explorer.altmempool.wtf",
      },
    },
    testnet: true,
  }),
  { profile: tracer, simulationUrl: ALT_MEMPOOL_NODE, sidecar: true },
);

/**
 * The public Hegota devnet (chain 3151908, ethrex `hegota-devnet`): frame
 * transactions with EIP-7906 assertions, canonical mempool only. Its chain
 * id is also Kurtosis' default, so a host should not assume a chain with
 * that id is this one.
 */
export const hegotaDevnet = withFrames(
  defineChain({
    id: 3151908,
    name: "Hegota devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [HEGOTA_DEVNET_RPC] } },
    blockExplorers: {
      default: { name: "Dora", url: "https://dora.hegota.ethrex.xyz" },
    },
    testnet: true,
  }),
  {
    profile: ethrexHegotaDevnetProfile,
    simulationUrl: HEGOTA_DEVNET_RPC,
    sidecar: false,
  },
);
