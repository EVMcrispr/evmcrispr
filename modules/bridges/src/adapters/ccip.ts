import type { Action } from "@evmcrispr/sdk";
import { chainLabel, clientFor, ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  toEventSelector,
  toHex,
  zeroAddress,
} from "viem";
import {
  CCIP_ROUTER,
  CCIP_SELECTOR_TO_CHAIN,
  CCIP_SELECTORS,
} from "../addresses";
import type { SourceTx } from "../utils/receipts";
import type {
  BridgeAdapter,
  BridgeFeeQuote,
  BridgeRequest,
  BridgeTransferStatus,
} from "./types";

const routerAbi = parseAbi([
  "struct EVMTokenAmount { address token; uint256 amount; }",
  "struct EVM2AnyMessage { bytes receiver; bytes data; EVMTokenAmount[] tokenAmounts; address feeToken; bytes extraArgs; }",
  "function getFee(uint64 destinationChainSelector, EVM2AnyMessage message) view returns (uint256 fee)",
  "function ccipSend(uint64 destinationChainSelector, EVM2AnyMessage message) payable returns (bytes32)",
  "function isChainSupported(uint64 chainSelector) view returns (bool)",
]);

/** Client.EVMExtraArgsV1 tag + abi.encode(gasLimit). */
const EVM_EXTRA_ARGS_V1_TAG = "0x97a657c9";

/** Emitted by the OnRamp; the messageId is the first indexed topic on 1.6. */
export const CCIP_SEND_REQUESTED_TOPIC = toEventSelector(
  "CCIPSendRequested((uint64,address,address,uint64,uint256,bool,uint64,address,uint256,bytes,(address,uint256)[],bytes[],bytes32))",
);
export const CCIP_MESSAGE_SENT_TOPIC = toEventSelector(
  "CCIPMessageSent(uint64,uint64,bytes32)",
);
export const EXECUTION_STATE_CHANGED_TOPIC = toEventSelector(
  "ExecutionStateChanged(uint64,uint64,bytes32,bytes32,uint8,bytes,uint256)",
);

function encodeExtraArgs(gasLimit: bigint): Hex {
  return `${EVM_EXTRA_ARGS_V1_TAG}${encodeAbiParameters(
    [{ type: "uint256" }],
    [gasLimit],
  ).slice(2)}` as Hex;
}

function buildMessage(req: BridgeRequest) {
  return {
    receiver: encodeAbiParameters([{ type: "address" }], [req.recipient]),
    data: "0x" as Hex,
    tokenAmounts: [{ token: req.token, amount: req.amount }],
    feeToken: zeroAddress, // pay the messaging fee in the native token
    // Token-only transfers to an EOA need no destination gas.
    extraArgs: encodeExtraArgs(0n),
  };
}

const ccip: BridgeAdapter = {
  name: "CCIP",
  kind: "onchain",

  supports(srcChainId, dstChainId, token) {
    if (srcChainId === dstChainId) return false;
    if (!(srcChainId in CCIP_ROUTER) || !(dstChainId in CCIP_SELECTORS))
      return false;
    // CCIP moves ERC-20s through token pools; the native token isn't one.
    if (token === zeroAddress) return false;
    return true;
  },

  requiresClaim() {
    return false;
  },

  async quote(module, req): Promise<BridgeFeeQuote> {
    const router = CCIP_ROUTER[req.srcChainId];
    const selector = CCIP_SELECTORS[req.dstChainId];
    const message = buildMessage(req);
    const client = await module.getClient();

    let fee: bigint;
    try {
      fee = (await client.readContract({
        address: router,
        abi: routerAbi,
        functionName: "getFee",
        args: [selector, message],
      })) as bigint;
    } catch (err) {
      throw new ErrorException(
        `CCIP can't route ${req.token} from ${chainLabel(req.srcChainId)} to ${chainLabel(req.dstChainId)} (the token may have no CCIP pool on this lane): ${(err as Error).message}`,
      );
    }

    return {
      tokenFee: 0n,
      nativeFee: fee,
      amountOut: req.amount,
      route: { router, selector, message, fee },
    };
  },

  async buildBridge(module, req) {
    const quote = req.quote ?? (await ccip.quote(module, req));
    const route = quote.route as {
      router: Address;
      selector: bigint;
      message: ReturnType<typeof buildMessage>;
      fee: bigint;
    };

    return {
      approvalTarget: route.router,
      actions: [
        {
          to: route.router,
          value: route.fee,
          data: encodeFunctionData({
            abi: routerAbi,
            functionName: "ccipSend",
            args: [route.selector, route.message],
          }),
        },
      ],
    };
  },

  async status(module, src): Promise<BridgeTransferStatus> {
    const messageId = findMessageId(src);
    if (!messageId) return "unknown";

    // The OffRamp that executes a lane isn't discoverable from the source
    // receipt alone; scan recent destination blocks for the execution event
    // carrying this messageId.
    const dstChainId = findDestinationChain(src);
    if (dstChainId === undefined) return "unknown";
    try {
      const client = await clientFor(module, dstChainId);
      const latest = await client.getBlockNumber();
      const logs = (await client.request({
        method: "eth_getLogs",
        params: [
          {
            fromBlock: toHex(latest > 5000n ? latest - 5000n : 0n),
            toBlock: toHex(latest),
            topics: [EXECUTION_STATE_CHANGED_TOPIC, null, null, messageId],
          },
        ],
      } as any)) as unknown[];
      return logs.length > 0 ? "done" : "pending";
    } catch {
      return "unknown";
    }
  },

  async buildClaim() {
    throw new ErrorException(
      "CCIP messages are executed by the DON on the destination chain; there is nothing to claim. If a message is stuck, use manual execution at https://ccip.chain.link",
    );
  },

  relayHandler: {
    id: "ccip",
    sourceEvents() {
      // The OnRamp address is lane-specific, so match on topic alone.
      return [
        { topic: CCIP_SEND_REQUESTED_TOPIC },
        { topic: CCIP_MESSAGE_SENT_TOPIC },
      ];
    },

    async parse(log, ctx) {
      const dstChainId = findDestinationChain({
        chainId: ctx.srcChainId,
        hash: "0x",
        logs: [log as any],
      });
      if (dstChainId === undefined) return null;
      return { dstChainId, note: "simplified effect relay" };
    },

    /**
     * CCIP's real destination leg needs a commit root signed by the
     * Chainlink DON, which can't be forged on a fork. Simulate the
     * user-visible effect instead: credit the recipient with the
     * destination token.
     */
    async buildDelivery(module, log, ctx): Promise<Action[]> {
      const transfer = decodeCcipTransfer(log);
      if (!transfer) {
        module.context.log(
          ":warning: couldn't decode the CCIP token transfer from the source event; skipping the simulated delivery",
        );
        return [];
      }
      const destToken = await resolveDestinationToken(
        module,
        ctx.srcChainId,
        ctx.dstChainId,
        transfer.token,
      );
      module.context.log(
        ":warning: CCIP delivery is simulated by crediting the recipient — the OffRamp is not executed",
      );
      const client = await module.getClient();
      const current = (await client
        .readContract({
          address: destToken,
          abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
          functionName: "balanceOf",
          args: [transfer.recipient],
        })
        .catch(() => 0n)) as bigint;
      return [
        {
          type: "rpc",
          method: "sim_dealToken",
          params: [
            destToken,
            transfer.recipient,
            toHex(current + transfer.amount),
          ],
        },
      ];
    },
  },
};

// ── Log decoding helpers ─────────────────────────────────────────────────

function findMessageId(src: SourceTx): Hex | undefined {
  const log = src.logs.find((l) =>
    [CCIP_SEND_REQUESTED_TOPIC, CCIP_MESSAGE_SENT_TOPIC].some(
      (topic) => l.topics?.[0]?.toLowerCase() === topic.toLowerCase(),
    ),
  );
  if (!log) return undefined;
  // CCIPMessageSent indexes (sourceChainSelector, sequenceNumber, messageId).
  return (log.topics?.[3] ?? log.topics?.[1]) as Hex | undefined;
}

function findDestinationChain(src: {
  chainId: number;
  hash: Hex;
  logs: { topics?: readonly Hex[] }[];
}): number | undefined {
  const log = src.logs.find((l) =>
    [CCIP_SEND_REQUESTED_TOPIC, CCIP_MESSAGE_SENT_TOPIC].some(
      (topic) => l.topics?.[0]?.toLowerCase() === topic.toLowerCase(),
    ),
  );
  const selector = log?.topics?.[1];
  if (!selector) return undefined;
  return CCIP_SELECTOR_TO_CHAIN[BigInt(selector).toString()];
}

interface CcipTransfer {
  token: Address;
  recipient: Address;
  amount: bigint;
}

/** CCIP 1.5 OnRamp: CCIPSendRequested(EVM2EVMMessage). */
const evm2EvmMessageAbi = [
  {
    type: "event",
    name: "CCIPSendRequested",
    inputs: [
      {
        name: "message",
        type: "tuple",
        indexed: false,
        components: [
          { name: "sourceChainSelector", type: "uint64" },
          { name: "sender", type: "address" },
          { name: "receiver", type: "address" },
          { name: "sequenceNumber", type: "uint64" },
          { name: "gasLimit", type: "uint256" },
          { name: "strict", type: "bool" },
          { name: "nonce", type: "uint64" },
          { name: "feeToken", type: "address" },
          { name: "feeTokenAmount", type: "uint256" },
          { name: "data", type: "bytes" },
          {
            name: "tokenAmounts",
            type: "tuple[]",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
          { name: "sourceTokenData", type: "bytes[]" },
          { name: "messageId", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

/**
 * Extract the (token, recipient, amount) triple the source message carries.
 * Only the 1.5 EVM2EVMMessage layout is decoded; newer OnRamp releases
 * return undefined and the delivery is skipped with a warning.
 */
function decodeCcipTransfer(log: {
  topics: readonly Hex[];
  data: Hex;
}): CcipTransfer | undefined {
  try {
    const decoded = decodeEventLog({
      abi: evm2EvmMessageAbi,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    });
    const message = (decoded.args as any).message;
    const first = message?.tokenAmounts?.[0];
    if (!first) return undefined;
    return {
      token: first.token as Address,
      recipient: message.receiver as Address,
      amount: BigInt(first.amount),
    };
  } catch {
    return undefined;
  }
}

const tokenAdminRegistryAbi = parseAbi([
  "function getPool(address token) view returns (address)",
]);
const poolAbi = parseAbi([
  "function getRemoteToken(uint64 remoteChainSelector) view returns (bytes)",
]);
const routerPoolAbi = parseAbi([
  "function getTokenAdminRegistry() view returns (address)",
]);

/**
 * Map a source token to its destination-chain counterpart via the CCIP
 * token pool's remote-token record, falling back to the same address.
 */
async function resolveDestinationToken(
  module: any,
  srcChainId: number,
  dstChainId: number,
  token: Address,
): Promise<Address> {
  try {
    const srcClient = await clientFor(module, srcChainId);
    const registry = (await srcClient.readContract({
      address: CCIP_ROUTER[srcChainId],
      abi: routerPoolAbi,
      functionName: "getTokenAdminRegistry",
    })) as Address;
    const pool = (await srcClient.readContract({
      address: registry,
      abi: tokenAdminRegistryAbi,
      functionName: "getPool",
      args: [token],
    })) as Address;
    const remote = (await srcClient.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getRemoteToken",
      args: [CCIP_SELECTORS[dstChainId]],
    })) as Hex;
    if (remote && remote.length >= 42) {
      return `0x${remote.slice(-40)}` as Address;
    }
  } catch {
    // Pool lookups are best-effort; fall through.
  }
  return token;
}

export default ccip;
