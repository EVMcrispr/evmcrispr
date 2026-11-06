import { toWire } from "@forshtat/hegota-support/rpc";
import { txHash } from "@forshtat/hegota-support/tx";
import type {
  Account,
  Address,
  Chain,
  Client,
  Hash,
  Hex,
  Transport,
} from "viem";
import { parseAccount } from "viem/accounts";
import { prepareTransactionRequest, sendRawTransaction } from "viem/actions";
import {
  estimateFrameGas,
  type FrameGasEstimate,
  frameProfileOf,
  frameSimulationUrlOf,
  simulate,
} from "./chain";
import { frameSerializer, parseFrameTransaction } from "./serializer";
import type { FrameTransactionRequest, FrameTx } from "./types";

export type FrameTransactionParameters = FrameTransactionRequest & {
  account?: Account | undefined;
  nonce?: number | undefined;
  maxFeePerGas?: bigint | undefined;
  maxPriorityFeePerGas?: bigint | undefined;
};

/** `skandha_frameTransactionStatus`. */
export interface FrameTransactionStatus {
  tx: Hash;
  sender: Address;
  payer: Address;
  factory?: Address;
  status:
    | "New"
    | "Pending"
    | "Submitted"
    | "OnChain"
    | "Finalized"
    | "Cancelled"
    | "Reverted";
  transaction?: Hash;
  reason?: string;
}

/**
 * `ethrex_simulateFrameTransaction`. Field names vary between ethrex builds:
 * the alt-mempool devnet answers `canonicalMempoolValid`, the Hegota devnet
 * `valid`. Either is necessary, not sufficient, for admission.
 */
export interface FrameSimulation {
  executionStatus?: string;
  frames?: { gasUsed: Hex; stateGasUsed?: Hex; succeeded: boolean }[];
  prefixShape?: string;
  payer?: Address;
  maxCost?: Hex;
  violation?: unknown;
  [key: string]: unknown;
}

type FramesClient = Client<Transport, Chain | undefined, Account | undefined>;

function localAccount(client: FramesClient, account: Account | undefined) {
  const resolved = account ?? client.account;
  if (!resolved) throw new Error("A frame transaction needs an account");
  const parsed = parseAccount(resolved);
  if (parsed.type !== "local" || !parsed.signTransaction)
    throw new Error(
      "Frame transactions are signed by a local account: wallets do not sign type 0x06",
    );
  return parsed;
}

/**
 * Alt-mempool (ERC-8421) actions, in the manner of viem's `bundlerActions`:
 * the sidecar has its own methods, and `eth_sendFrameTransaction` takes the
 * transaction as JSON instead of raw bytes. Use with a chain from
 * `withFrames`.
 *
 * ```ts
 * const client = createWalletClient({ account, chain: altMempoolDevnet, transport: http() })
 *   .extend(altMempoolActions());
 * const hash = await client.sendFrameTransaction({
 *   frames: [selfVerify(), call({ to, value: 1n })],
 * });
 * ```
 */
export function altMempoolActions() {
  return (client: FramesClient) => {
    const profile = () => frameProfileOf(client.chain);

    async function signFrameTransaction(
      parameters: FrameTransactionParameters,
    ): Promise<Hex> {
      const account = localAccount(client, parameters.account);
      const request = await prepareTransactionRequest(client, {
        ...parameters,
        account,
        chain: client.chain,
        type: "frame",
      } as never);
      return account.signTransaction!(request as never, {
        serializer:
          client.chain?.serializers?.transaction ?? frameSerializer(profile()),
      });
    }

    return {
      /**
       * Fills nonce, fees and every frame's limits. It signs nothing, except
       * the provisional transaction `sizeBySimulation` asks for.
       */
      prepareFrameTransaction: (parameters: FrameTransactionParameters) =>
        prepareTransactionRequest(client, {
          ...parameters,
          account: localAccount(client, parameters.account),
          chain: client.chain,
          type: "frame",
        } as never),

      /** The signed `0x06 || rlp(payload)` bytes. */
      signFrameTransaction,

      /**
       * Signs and submits. `mempool: "alt"` (the default) goes to the
       * sidecar's standard alt mempool; `"canonical"` sends the raw bytes on
       * to the node's public mempool, which applies EIP-8141's strict rules.
       */
      async sendFrameTransaction({
        mempool = "alt",
        ...parameters
      }: FrameTransactionParameters & {
        mempool?: "alt" | "canonical";
      }): Promise<Hash> {
        const serializedTransaction = await signFrameTransaction(parameters);
        if (mempool === "canonical")
          return sendRawTransaction(client, { serializedTransaction });
        const tx = parseFrameTransaction(serializedTransaction, profile());
        const hash = (await client.request({
          method: "eth_sendFrameTransaction",
          params: [toWire(tx)],
        } as never)) as Hash;
        const expected = txHash(profile(), tx);
        if (hash.toLowerCase() !== expected.toLowerCase())
          throw new Error(
            `The sidecar returned ${hash} for a transaction whose hash is ${expected}`,
          );
        return hash;
      },

      estimateFrameTransactionGas: async (
        parameters: FrameTransactionParameters & {
          nonce: number;
          maxFeePerGas: bigint;
          maxPriorityFeePerGas: bigint;
        },
      ): Promise<FrameGasEstimate> => {
        const chainId = client.chain?.id;
        if (chainId === undefined) throw new Error("The client has no chain");
        return estimateFrameGas(client, {
          chainId,
          sender: localAccount(client, parameters.account).address,
          nonce: parameters.nonce,
          nonceKeys: parameters.nonceKeys,
          frames: parameters.frames,
          maxFeePerGas: parameters.maxFeePerGas,
          maxPriorityFeePerGas: parameters.maxPriorityFeePerGas,
          profile: profile(),
        });
      },

      /**
       * Dry-runs signed bytes on the chain's ethrex node with every
       * frame-specific admission gate, then the body. The sidecar does not
       * serve this method, so it needs `withFrames`' `simulationUrl`.
       */
      simulateFrameTransaction: ({
        serializedTransaction,
        blockTag = "latest",
        trace = false,
      }: {
        serializedTransaction: Hex;
        blockTag?: "latest" | "pending" | Hex;
        trace?: boolean;
      }) => {
        const url = frameSimulationUrlOf(client.chain);
        if (!url) throw new Error("The client's chain has no simulationUrl");
        return simulate(
          url,
          serializedTransaction,
          blockTag,
          trace ? { trace } : undefined,
        ) as Promise<FrameSimulation>;
      },

      getFrameTransactionStatus: (hash: Hash) =>
        client.request({
          method: "skandha_frameTransactionStatus",
          params: [hash],
        } as never) as Promise<FrameTransactionStatus>,

      /** The devnet faucet (`skandha_explorer_faucet`): 1 ETH, once an hour per address. */
      requestFaucet: (address: Address) =>
        client.request({
          method: "skandha_explorer_faucet",
          params: [address],
        } as never) as Promise<unknown>,

      /** Decodes signed bytes into the library's transaction. */
      parseFrameTransaction: (raw: Hex): FrameTx =>
        parseFrameTransaction(raw, profile()),
    };
  };
}
