import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import type { Address } from "viem";
import {
  encodeFunctionData,
  formatUnits,
  parseAbi,
  parseAbiItem,
  zeroAddress,
} from "viem";
import type Swaps from "..";
import { BALANCER_CHAINS, BALANCER_VAULT } from "../addresses";
import type { Quote, QuoteRequest, VenueAdapter } from "./types";

const API_URL = "https://api-v3.balancer.fi/";

const decimalsAbi = parseAbiItem("function decimals() view returns (uint8)");

const vaultAbi = parseAbi([
  "struct BatchSwapStep { bytes32 poolId; uint256 assetInIndex; uint256 assetOutIndex; uint256 amount; bytes userData; }",
  "struct FundManagement { address sender; bool fromInternalBalance; address recipient; bool toInternalBalance; }",
  "function batchSwap(uint8 kind, BatchSwapStep[] swaps, address[] assets, FundManagement funds, int256[] limits, uint256 deadline) payable returns (int256[] assetDeltas)",
]);

// Arguments are inlined instead of passed as GraphQL variables: the API
// gateway drops some variables (observed: $amount, $type). Every value has
// a controlled format (enum, decimal string, hex address), so inlining is
// injection-safe.
const sorQuery = (args: {
  chain: string;
  amount: string;
  type: string;
  tokenIn: string;
  tokenOut: string;
}) => `query {
  sorGetSwapPaths(chain: ${args.chain}, swapAmount: "${args.amount}", swapType: ${args.type}, tokenIn: "${args.tokenIn}", tokenOut: "${args.tokenOut}", useProtocolVersion: 2) {
    swapAmountRaw
    returnAmountRaw
    swaps { poolId assetInIndex assetOutIndex amount userData }
    tokenAddresses
  }
}`;

interface SorPaths {
  swapAmountRaw: string;
  returnAmountRaw: string;
  swaps: {
    poolId: `0x${string}`;
    assetInIndex: number;
    assetOutIndex: number;
    amount: string;
    userData: `0x${string}`;
  }[];
  tokenAddresses: Address[];
}

function rejectNative(req: QuoteRequest): void {
  if (req.tokenIn === zeroAddress || req.tokenOut === zeroAddress) {
    throw new ErrorException(
      "the Balancer venue swaps ERC20 tokens only; wrap the native token first with swaps:wrap",
    );
  }
}

async function fetchSorPaths(
  module: Swaps,
  req: QuoteRequest,
): Promise<SorPaths> {
  const chain = BALANCER_CHAINS[req.chainId];
  if (!chain) {
    throw new ErrorNotFound(`Balancer is not deployed on chain ${req.chainId}`);
  }

  // The SOR API takes human-readable amounts, scaled by the exact token
  // (tokenIn for exact-in, tokenOut for exact-out).
  const client = await module.getClient();
  const exactToken = req.kind === "exactIn" ? req.tokenIn : req.tokenOut;
  const decimals = await client.readContract({
    address: exactToken,
    abi: [decimalsAbi],
    functionName: "decimals",
  });

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: sorQuery({
          chain,
          amount: formatUnits(req.amount, decimals),
          type: req.kind === "exactIn" ? "EXACT_IN" : "EXACT_OUT",
          tokenIn: req.tokenIn.toLowerCase(),
          tokenOut: req.tokenOut.toLowerCase(),
        }),
      }),
    });
  } catch (err) {
    throw new ErrorException(
      `Balancer SOR request failed: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (!res.ok) {
    throw new ErrorException(
      `Balancer SOR request failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as {
    data?: { sorGetSwapPaths?: SorPaths };
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new ErrorException(`Balancer SOR error: ${body.errors[0].message}`);
  }
  const paths = body.data?.sorGetSwapPaths;
  if (!paths || paths.swaps.length === 0) {
    throw new ErrorNotFound(
      `Balancer has no liquidity path from ${req.tokenIn} to ${req.tokenOut}`,
    );
  }
  return paths;
}

function toQuote(req: QuoteRequest, paths: SorPaths): Quote {
  return req.kind === "exactIn"
    ? {
        amountIn: req.amount,
        amountOut: BigInt(paths.returnAmountRaw),
        route: paths,
      }
    : {
        amountIn: BigInt(paths.returnAmountRaw),
        amountOut: req.amount,
        route: paths,
      };
}

const balancer: VenueAdapter = {
  name: "Balancer",
  kind: "api",
  supportsExactOut: true,
  supports: (chainId) => chainId in BALANCER_CHAINS,

  async quote(module, req) {
    rejectNative(req);
    return toQuote(req, await fetchSorPaths(module, req));
  },

  async buildSwap(module, req) {
    rejectNative(req);
    const paths =
      (req.quote?.route as SorPaths | undefined) ??
      (await fetchSorPaths(module, req));

    const assets = paths.tokenAddresses;
    const findIndex = (token: Address) =>
      assets.findIndex((a) => a.toLowerCase() === token.toLowerCase());
    const inIndex = findIndex(req.tokenIn);
    const outIndex = findIndex(req.tokenOut);
    if (inIndex === -1 || outIndex === -1) {
      throw new ErrorException(
        "Balancer SOR returned a route not involving the swapped tokens",
      );
    }

    const exactIn = req.kind === "exactIn";
    const inputLimit = exactIn ? req.amount : req.limit;
    // Positive limits cap what the vault may pull; negative ones floor what
    // it must pay out. Intermediate hop assets stay unconstrained at 0.
    const limits = assets.map(() => 0n);
    limits[inIndex] = inputLimit;
    limits[outIndex] = -(exactIn ? req.limit : req.amount);

    const data = encodeFunctionData({
      abi: vaultAbi,
      functionName: "batchSwap",
      args: [
        exactIn ? 0 : 1, // GIVEN_IN / GIVEN_OUT
        paths.swaps.map((s) => ({
          poolId: s.poolId,
          assetInIndex: BigInt(s.assetInIndex),
          assetOutIndex: BigInt(s.assetOutIndex),
          amount: BigInt(s.amount),
          userData: s.userData ?? "0x",
        })),
        assets,
        {
          sender: req.from,
          fromInternalBalance: false,
          recipient: req.recipient,
          toInternalBalance: false,
        },
        limits,
        req.deadline,
      ],
    });

    return {
      approvalTarget: BALANCER_VAULT,
      approvalAmount: inputLimit,
      actions: [{ to: BALANCER_VAULT, data }],
    };
  },
};

export default balancer;
