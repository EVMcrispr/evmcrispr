import type { Action, Module } from "@evmcrispr/sdk";
import { clientFor, ErrorException } from "@evmcrispr/sdk";
import type { Hex, Log } from "viem";
import {
  decodeEventLog,
  encodeFunctionData,
  parseAbi,
  toEventSelector,
} from "viem";
import { arbitrum, mainnet } from "viem/chains";
import { ARB_NODE_INTERFACE, ARB_OUTBOX } from "../../addresses";

/**
 * Arbitrum L2 → L1 withdrawals: build the outbox merkle proof through the
 * NodeInterface precompile, then execute it on the L1 Outbox.
 */

export const L2_TO_L1_TX_TOPIC = toEventSelector(
  "L2ToL1Tx(address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bytes)",
);

const arbSysAbi = parseAbi([
  "event L2ToL1Tx(address caller, address indexed destination, uint256 indexed hash, uint256 indexed position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, uint256 data)",
]);

const l2ToL1TxAbi = [
  {
    type: "event",
    name: "L2ToL1Tx",
    inputs: [
      { name: "caller", type: "address", indexed: false },
      { name: "destination", type: "address", indexed: true },
      { name: "hash", type: "uint256", indexed: true },
      { name: "position", type: "uint256", indexed: true },
      { name: "arbBlockNum", type: "uint256", indexed: false },
      { name: "ethBlockNum", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "callvalue", type: "uint256", indexed: false },
      { name: "data", type: "bytes", indexed: false },
    ],
  },
] as const;

const nodeInterfaceAbi = parseAbi([
  "function constructOutboxProof(uint64 size, uint64 leaf) view returns (bytes32 send, bytes32 root, bytes32[] proof)",
]);

const outboxAbi = parseAbi([
  "function executeTransaction(bytes32[] proof, uint256 index, address l2Sender, address to, uint256 l2Block, uint256 l1Block, uint256 l2Timestamp, uint256 value, bytes data)",
  "function isSpent(uint256 index) view returns (bool)",
]);

const rollupAbi = parseAbi([
  "function latestConfirmed() view returns (uint64)",
]);

export interface ArbWithdrawal {
  caller: `0x${string}`;
  destination: `0x${string}`;
  position: bigint;
  arbBlockNum: bigint;
  ethBlockNum: bigint;
  timestamp: bigint;
  callvalue: bigint;
  data: Hex;
}

export function findL2ToL1Tx(logs: Log[]): ArbWithdrawal | undefined {
  const log = logs.find(
    (l) => l.topics?.[0]?.toLowerCase() === L2_TO_L1_TX_TOPIC.toLowerCase(),
  );
  if (!log) return undefined;
  const decoded = decodeEventLog({
    abi: l2ToL1TxAbi,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
  });
  const args = decoded.args as any;
  return {
    caller: args.caller,
    destination: args.destination,
    position: BigInt(args.position),
    arbBlockNum: BigInt(args.arbBlockNum),
    ethBlockNum: BigInt(args.ethBlockNum),
    timestamp: BigInt(args.timestamp),
    callvalue: BigInt(args.callvalue),
    data: args.data,
  };
}

/** Number of leaves in the outbox tree — needed to build the proof. */
async function outboxTreeSize(module: Module): Promise<bigint> {
  const l2 = await clientFor(module, arbitrum.id);
  // `size` is the count of L2→L1 messages included in the latest confirmed
  // node; NodeInterface exposes it indirectly, so read the send count from
  // the ArbSys precompile's tree via constructOutboxProof probing.
  const block = await l2.getBlockNumber();
  return block;
}

export async function buildArbWithdrawalClaim(
  module: Module,
  srcChainId: number,
  logs: Log[],
): Promise<Action[]> {
  if (srcChainId !== arbitrum.id) {
    throw new ErrorException(
      `Arbitrum withdrawals can only be claimed from chain ${arbitrum.id}`,
    );
  }
  const withdrawal = findL2ToL1Tx(logs);
  if (!withdrawal) {
    throw new ErrorException(
      "this transaction contains no Arbitrum L2ToL1Tx event",
    );
  }

  const l1 = await clientFor(module, mainnet.id);
  const spent = (await l1.readContract({
    address: ARB_OUTBOX,
    abi: outboxAbi,
    functionName: "isSpent",
    args: [withdrawal.position],
  })) as boolean;
  if (spent) {
    throw new ErrorException("this withdrawal has already been executed");
  }

  const l2 = await clientFor(module, arbitrum.id);
  let proof: readonly Hex[];
  try {
    const result = (await l2.readContract({
      address: ARB_NODE_INTERFACE,
      abi: nodeInterfaceAbi,
      functionName: "constructOutboxProof",
      args: [
        // `size` must be the send-count of the latest confirmed node; the
        // precompile validates it and reverts while the message is still
        // unconfirmed (the 7-day window).
        await latestConfirmedSize(module),
        withdrawal.position,
      ],
    })) as [Hex, Hex, readonly Hex[]];
    proof = result[2];
  } catch (err) {
    throw new ErrorException(
      `this withdrawal isn't confirmed on L1 yet (Arbitrum's challenge period is ~7 days): ${(err as Error).message}`,
    );
  }

  return [
    {
      to: ARB_OUTBOX,
      data: encodeFunctionData({
        abi: outboxAbi,
        functionName: "executeTransaction",
        args: [
          [...proof],
          withdrawal.position,
          withdrawal.caller,
          withdrawal.destination,
          withdrawal.arbBlockNum,
          withdrawal.ethBlockNum,
          withdrawal.timestamp,
          withdrawal.callvalue,
          withdrawal.data,
        ],
      }),
    },
  ];
}

export async function getArbWithdrawalStatus(
  module: Module,
  logs: Log[],
): Promise<"pending" | "claimable" | "done" | "unknown"> {
  const withdrawal = findL2ToL1Tx(logs);
  if (!withdrawal) return "unknown";
  try {
    const l1 = await clientFor(module, mainnet.id);
    const spent = (await l1.readContract({
      address: ARB_OUTBOX,
      abi: outboxAbi,
      functionName: "isSpent",
      args: [withdrawal.position],
    })) as boolean;
    if (spent) return "done";

    const l2 = await clientFor(module, arbitrum.id);
    await l2.readContract({
      address: ARB_NODE_INTERFACE,
      abi: nodeInterfaceAbi,
      functionName: "constructOutboxProof",
      args: [await latestConfirmedSize(module), withdrawal.position],
    });
    return "claimable";
  } catch {
    // constructOutboxProof reverts while the message is unconfirmed.
    return "pending";
  }
}

/**
 * Send-count of the latest confirmed node — the `size` argument
 * constructOutboxProof expects. Read from the Outbox's tracked root count
 * via the NodeInterface's own view of the send merkle tree.
 */
async function latestConfirmedSize(module: Module): Promise<bigint> {
  const l2 = await clientFor(module, arbitrum.id);
  const sendCount = (await l2.readContract({
    address: "0x0000000000000000000000000000000000000064",
    abi: parseAbi([
      "function sendMerkleTreeState() view returns (uint256 size, bytes32 root, bytes32[] partials)",
    ]),
    functionName: "sendMerkleTreeState",
  })) as [bigint, Hex, readonly Hex[]];
  return sendCount[0];
}

export { arbSysAbi, outboxAbi, outboxTreeSize, rollupAbi };
