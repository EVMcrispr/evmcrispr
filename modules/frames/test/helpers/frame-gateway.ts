import { parseFrameTransactionRequest } from "@evmcrispr/viem-frames";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, newTx, signTx, txHash } from "@forshtat/hegota-support/tx";
import {
  createWalletClient,
  custom,
  type Hash,
  type Hex,
  keccak256,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { frameAction } from "../../src/actions";
import type {
  FrameActionData,
  FrameModuleAction,
} from "../../src/frame-action";

// Also used by the terminal's tests (apps/evmcrispr-terminal/test), which
// send and review this module's frame action.

// Anvil's account #2: the account's owner, the key MetaMask stands for.
const OWNER_KEY =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
export const OWNER = privateKeyToAccount(OWNER_KEY);
// Anvil's account #1 as the FrameAccount, and #3 as a call's target.
export const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
export const RECIPIENT = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as const;

/** A FrameAccount's transaction as `frames:tx --account` writes it: the
 *  account's check, then one call. */
export const accountAction = ({
  chainId = 1337,
  from = ACCOUNT,
  ...data
}: Partial<
  FrameActionData & { chainId: number; from: `0x${string}` }
> = {}): FrameModuleAction =>
  frameAction.create({
    chainId,
    from,
    data: {
      frames: [
        {
          mode: "verify",
          approve: "both",
          target: null,
          data: "0xb22253510000000000000000000000000000000000000000000000000000000000000003",
          value: 0n,
          gas: 40_000n,
        },
        {
          mode: "sender",
          target: RECIPIENT,
          data: "0xd09de08a",
          value: 1_000n,
          gas: 50_000n,
          stateGas: 200_000n,
        },
      ],
      mempool: "alt",
      account: { kind: "frame-account", owner: OWNER.address },
      ...data,
    },
  });

/** The hash of the transaction the gateway was handed, as it computes it. */
function hashOfWire(wire: any): Hash {
  return txHash(
    profile,
    newTx({
      chainId: BigInt(wire.chainId),
      sender: wire.sender,
      nonceSeq: BigInt(wire.nonceSeq ?? wire.nonce),
      nonceKeys: wire.nonceKeys?.map(BigInt),
      frames: wire.frames.map((f: any) => ({
        mode: Number(f.mode),
        flags: Number(f.flags),
        target: f.target,
        limits: {
          execution: BigInt(f.limits.execution),
          state: BigInt(f.limits.state),
        },
        value: BigInt(f.value),
        data: f.data,
      })),
      signatures: wire.signatures.map((s: any) => ({
        scheme: Number(s.scheme),
        signer: s.signer,
        msg: s.msg,
        signature: s.signature,
      })),
      fees: {
        maxFeePerGas: BigInt(wire.maxFeePerGas ?? wire.fees.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(
          wire.maxPriorityFeePerGas ?? wire.fees.maxPriorityFeePerGas,
        ),
      },
    }),
  ) as Hash;
}

/** The alt-mempool gateway: the account has code, the sent transaction is
 *  admitted under its own hash and mined at once. */
export function frameGateway() {
  const calls: { method: string; params: any }[] = [];
  let sent: Hash | undefined;
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId":
          return "0x539";
        case "eth_getCode":
          return "0x6001";
        case "eth_getTransactionCount":
          return "0x3";
        case "skandha_getGasPrice":
          return {
            maxFeePerGas: "0x77359400",
            maxPriorityFeePerGas: "0x3b9aca00",
          };
        case "eth_sendFrameTransaction":
          sent = hashOfWire(params[0]);
          return sent;
        case "skandha_frameTransactionStatus":
          return { tx: sent, status: "OnChain" };
        case "eth_blockNumber":
          return "0x10";
        case "eth_getTransactionReceipt":
          return {
            type: "0x6",
            status: "0x1",
            blockHash: `0x${"11".repeat(32)}`,
            blockNumber: "0x10",
            transactionHash: params[0],
            transactionIndex: "0x0",
            from: ACCOUNT,
            to: null,
            cumulativeGasUsed: "0x1",
            gasUsed: "0x1",
            effectiveGasPrice: "0x7",
            contractAddress: null,
            logs: [],
            logsBloom: `0x${"00".repeat(256)}`,
            payer: ACCOUNT,
            frameReceipts: [],
          };
        case "eth_getTransactionByHash":
          return null;
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
  return { transport, calls, sent: () => sent };
}

/** MetaMask as the run sees it: a JSON-RPC account on `chainId`, signing
 *  typed data with the owner's key unless `sign` answers otherwise. */
export function metaMask({
  chainId = 1337,
  sign,
}: {
  chainId?: number;
  sign?: (typed: any) => Promise<unknown>;
} = {}): { wallet: WalletClient; asked: { method: string; params: any }[] } {
  const asked: { method: string; params: any }[] = [];
  const wallet: WalletClient = createWalletClient({
    account: OWNER.address,
    transport: custom({
      async request({ method, params }: { method: string; params: any }) {
        asked.push({ method, params });
        if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
        if (method === "eth_accounts") return [OWNER.address];
        if (method === "eth_signTypedData_v4") {
          const typed = JSON.parse(params[1]);
          return sign ? sign(typed) : OWNER.signTypedData(typed);
        }
        throw new Error(`unexpected ${method}`);
      },
    }),
  });
  return { wallet, asked };
}

/** A plain sender's frame transaction as `frames:tx` writes it: the
 *  sender's self-verify, then one call. */
export const plainAction = ({
  chainId = 1337,
  from = OWNER.address,
  ...data
}: Partial<
  FrameActionData & { chainId: number; from: `0x${string}` }
> = {}): FrameModuleAction =>
  frameAction.create({
    chainId,
    from,
    data: {
      frames: [
        {
          mode: "verify",
          approve: "both",
          target: null,
          data: "0x",
          value: 0n,
          gas: 30_000n,
        },
        {
          mode: "sender",
          target: RECIPIENT,
          data: "0xd09de08a",
          value: 1_000n,
          gas: 50_000n,
          stateGas: 200_000n,
        },
      ],
      mempool: "alt",
      ...data,
    },
  });

/** A wallet that signs frame transactions (EIP-8141), as the test wallet
 *  will: a JSON-RPC account on `chainId` answering `eth_signTransaction`
 *  for type 0x06 with the owner's key, unless it `refuses`. */
export function frameWallet({
  chainId = 1337,
  refuses,
  profile: signing = profile,
}: {
  chainId?: number;
  refuses?: string;
  /** The chain's profile (the Hegota devnet's has POST_TX). */
  profile?: typeof profile;
} = {}): {
  wallet: WalletClient;
  asked: { method: string; params: any }[];
} {
  const asked: { method: string; params: any }[] = [];
  const wallet: WalletClient = createWalletClient({
    account: OWNER.address,
    transport: custom({
      async request({ method, params }: { method: string; params: any }) {
        asked.push({ method, params });
        if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
        if (method === "eth_accounts") return [OWNER.address];
        if (method === "eth_signTransaction") {
          if (refuses) throw new Error(refuses);
          const tx = parseFrameTransactionRequest(params[0], signing);
          return encodeTx(signing, await signTx(signing, tx, OWNER_KEY));
        }
        throw new Error(`unexpected ${method}`);
      },
    }),
  });
  return { wallet, asked };
}

/** A local devnet's ethrex node: no sidecar, fees from its blocks, raw
 *  transactions admitted; it mines only when `mines`. */
export function frameNode({
  chainId,
  mines = true,
  status = "0x1",
  frameStatuses = [],
  verdict,
}: {
  chainId: number;
  mines?: boolean;
  /** What `ethrex_simulateFrameTransaction` answers; without it the node
   *  does not serve the method. */
  verdict?: { valid: boolean; violation?: string };
  /** The mined receipt's status, and its frames'. */
  status?: Hex;
  frameStatuses?: Hex[];
}) {
  const calls: { method: string; params: any }[] = [];
  let sent: Hash | undefined;
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId":
          return `0x${chainId.toString(16)}`;
        case "eth_getTransactionCount":
          return "0x0";
        case "eth_getBlockByNumber":
          return {
            number: "0x10",
            hash: `0x${"22".repeat(32)}`,
            baseFeePerGas: "0x7",
            timestamp: "0x1",
            transactions: [],
          };
        case "eth_maxPriorityFeePerGas":
          return "0x1";
        case "ethrex_simulateFrameTransaction":
          if (!verdict) throw new Error("the method does not exist");
          return verdict;
        case "eth_sendRawTransaction":
          sent = keccak256(params[0] as Hex);
          return sent;
        case "eth_blockNumber":
          return "0x10";
        case "eth_getTransactionReceipt":
          return mines && sent
            ? {
                type: "0x6",
                status,
                blockHash: `0x${"11".repeat(32)}`,
                blockNumber: "0x10",
                transactionHash: params[0],
                transactionIndex: "0x0",
                from: OWNER.address,
                to: null,
                cumulativeGasUsed: "0x1",
                gasUsed: "0x1",
                effectiveGasPrice: "0x7",
                contractAddress: null,
                logs: [],
                logsBloom: `0x${"00".repeat(256)}`,
                payer: OWNER.address,
                frameReceipts: frameStatuses.map((s) => ({
                  status: s,
                  gasUsed: "0x0",
                  stateGasUsed: "0x0",
                  logs: [],
                })),
              }
            : null;
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
  return { transport, calls, sent: () => sent };
}
