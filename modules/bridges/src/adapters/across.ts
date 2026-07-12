import type { Action } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  decodeEventLog,
  encodeFunctionData,
  parseAbi,
  toEventSelector,
  toHex,
  zeroAddress,
} from "viem";
import { ACROSS_SPOKE_POOL, USDC } from "../addresses";
import type { SourceTx } from "../utils/receipts";
import { activeSimMode } from "../utils/sim";
import { fetchDepositStatus, fetchSuggestedFees } from "./lib/acrossApi";
import type {
  BridgeAdapter,
  BridgeFeeQuote,
  BridgeTransferStatus,
} from "./types";

/** Deterministic relay-fee estimate used under sim:fork (25 bps). */
export const SIM_FEE_BPS = 25n;
const FILL_DEADLINE_BUFFER = 4n * 3600n;

const spokePoolAbi = parseAbi([
  "function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes message)",
  "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint32 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address indexed depositor, address recipient, address exclusiveRelayer, bytes message)",
  "event FundsDeposited(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint256 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 indexed depositor, bytes32 recipient, bytes32 exclusiveRelayer, bytes message)",
]);

export const V3_FUNDS_DEPOSITED_TOPIC = toEventSelector(
  "V3FundsDeposited(address,address,uint256,uint256,uint256,uint32,uint32,uint32,uint32,address,address,address,bytes)",
);
export const FUNDS_DEPOSITED_TOPIC = toEventSelector(
  "FundsDeposited(bytes32,bytes32,uint256,uint256,uint256,uint256,uint32,uint32,uint32,bytes32,bytes32,bytes32,bytes)",
);

/** Cross-chain address books for assets Across treats as equivalent. */
const TOKEN_EQUIVALENTS: Record<number, Address>[] = [
  USDC,
  {
    // WETH
    1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    10: "0x4200000000000000000000000000000000000006",
    137: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    8453: "0x4200000000000000000000000000000000000006",
    42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  {
    // DAI
    1: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    10: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    137: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    8453: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    42161: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  },
  {
    // USDT
    1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    137: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    42161: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  },
  {
    // WBTC
    1: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    10: "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
    137: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
    42161: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
  },
];

function equivalentToken(
  srcChainId: number,
  dstChainId: number,
  token: Address,
): Address | undefined {
  const book = TOKEN_EQUIVALENTS.find(
    (entry) => entry[srcChainId]?.toLowerCase() === token.toLowerCase(),
  );
  return book?.[dstChainId];
}

function decodeDeposit(log: { topics: Hex[]; data: Hex }) {
  const decoded = decodeEventLog({
    abi: spokePoolAbi,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
  });
  const args = decoded.args as any;
  const asAddress = (value: Hex): Address =>
    value.length === 66
      ? (`0x${value.slice(26)}` as Address)
      : (value as Address);
  return {
    depositId: BigInt(args.depositId),
    destinationChainId: BigInt(args.destinationChainId),
    outputToken: asAddress(args.outputToken),
    recipient: asAddress(args.recipient),
    outputAmount: BigInt(args.outputAmount),
  };
}

function findDepositLog(src: SourceTx) {
  const spoke = ACROSS_SPOKE_POOL[src.chainId]?.toLowerCase();
  return src.logs.find(
    (l) =>
      l.address.toLowerCase() === spoke &&
      [V3_FUNDS_DEPOSITED_TOPIC, FUNDS_DEPOSITED_TOPIC].some(
        (topic) => l.topics?.[0]?.toLowerCase() === topic.toLowerCase(),
      ),
  );
}

const across: BridgeAdapter = {
  name: "Across",
  kind: "api",

  supports(srcChainId, dstChainId, token) {
    if (srcChainId === dstChainId) return false;
    if (
      !(srcChainId in ACROSS_SPOKE_POOL) ||
      !(dstChainId in ACROSS_SPOKE_POOL)
    )
      return false;
    // The native token must be bridged as WETH in v1.
    if (token !== undefined && token === zeroAddress) return false;
    return true;
  },

  requiresClaim() {
    return false;
  },

  async quote(module, req): Promise<BridgeFeeQuote> {
    if (req.token === zeroAddress) {
      throw new ErrorException(
        "Across can't bridge the native token directly; wrap it and bridge WETH",
      );
    }
    const outputToken = equivalentToken(
      req.srcChainId,
      req.dstChainId,
      req.token,
    );
    if (!outputToken) {
      throw new ErrorException(
        `no known equivalent of ${req.token} on chain ${req.dstChainId} for Across; pass --remote-token <address>`,
      );
    }

    if (activeSimMode(module)) {
      // Live fee quotes aren't deterministic inside a fork — use a fixed
      // 25 bps estimate and derive timestamps from the fork's clock.
      const client = await module.getClient();
      const block = await client.getBlock();
      const tokenFee = (req.amount * SIM_FEE_BPS) / 10_000n;
      module.context.log(
        `Across: using a deterministic ${SIM_FEE_BPS} bps fee estimate inside the simulation`,
      );
      return {
        tokenFee,
        nativeFee: 0n,
        amountOut: req.amount - tokenFee,
        route: {
          outputToken,
          quoteTimestamp: block.timestamp,
          fillDeadline: block.timestamp + FILL_DEADLINE_BUFFER,
          exclusiveRelayer: zeroAddress,
          exclusivityDeadline: 0n,
        },
      };
    }

    const fees = await fetchSuggestedFees({
      inputToken: req.token,
      outputToken,
      originChainId: req.srcChainId,
      destinationChainId: req.dstChainId,
      amount: req.amount,
      recipient: req.recipient,
    });
    const tokenFee = BigInt(fees.totalRelayFee.total);
    const client = await module.getClient();
    const block = await client.getBlock();
    return {
      tokenFee,
      nativeFee: 0n,
      amountOut: fees.outputAmount
        ? BigInt(fees.outputAmount)
        : req.amount - tokenFee,
      route: {
        outputToken: fees.outputToken ?? outputToken,
        quoteTimestamp: BigInt(fees.timestamp),
        fillDeadline: fees.fillDeadline
          ? BigInt(fees.fillDeadline)
          : block.timestamp + FILL_DEADLINE_BUFFER,
        exclusiveRelayer: fees.exclusiveRelayer ?? zeroAddress,
        exclusivityDeadline: BigInt(fees.exclusivityDeadline ?? 0),
      },
    };
  },

  async buildBridge(module, req) {
    const quote = req.quote ?? (await across.quote(module, req));
    const route = quote.route as {
      outputToken: Address;
      quoteTimestamp: bigint;
      fillDeadline: bigint;
      exclusiveRelayer: Address;
      exclusivityDeadline: bigint;
    };
    const spokePool = ACROSS_SPOKE_POOL[req.srcChainId];

    return {
      approvalTarget: spokePool,
      actions: [
        {
          to: spokePool,
          data: encodeFunctionData({
            abi: spokePoolAbi,
            functionName: "depositV3",
            args: [
              req.from,
              req.recipient,
              req.token,
              route.outputToken,
              req.amount,
              quote.amountOut,
              BigInt(req.dstChainId),
              route.exclusiveRelayer,
              Number(route.quoteTimestamp),
              Number(route.fillDeadline),
              Number(route.exclusivityDeadline),
              "0x",
            ],
          }),
        },
      ],
    };
  },

  async status(_module, src): Promise<BridgeTransferStatus> {
    const log = findDepositLog(src);
    if (!log) return "unknown";
    const { depositId } = decodeDeposit(log as any);
    const { status } = await fetchDepositStatus(src.chainId, depositId);
    return status === "filled" ? "done" : "pending";
  },

  async buildClaim() {
    throw new ErrorException(
      "Across transfers are filled by relayers on the destination chain; there is nothing to claim",
    );
  },

  relayHandler: {
    id: "across",
    sourceEvents(srcChainId) {
      const spoke = ACROSS_SPOKE_POOL[srcChainId];
      if (!spoke) return [];
      return [
        { topic: V3_FUNDS_DEPOSITED_TOPIC, address: spoke },
        { topic: FUNDS_DEPOSITED_TOPIC, address: spoke },
      ];
    },

    async parse(log) {
      const { destinationChainId, outputAmount, recipient } =
        decodeDeposit(log);
      return {
        dstChainId: Number(destinationChainId),
        note: `${outputAmount} to ${recipient}`,
      };
    },

    /** Model the relayer fill's user-visible effect: credit the recipient
     *  with the output token on the destination fork. */
    async buildDelivery(module, log): Promise<Action[]> {
      const { outputToken, recipient, outputAmount } = decodeDeposit(log);
      // sim_dealToken sets an absolute balance — add on top of the
      // recipient's current holdings on the destination fork.
      const client = await module.getClient();
      const current = (await client
        .readContract({
          address: outputToken,
          abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
          functionName: "balanceOf",
          args: [recipient],
        })
        .catch(() => 0n)) as bigint;
      return [
        {
          type: "rpc",
          method: "sim_dealToken",
          params: [outputToken, recipient, toHex(current + outputAmount)],
        },
      ];
    },
  },
};

export default across;
