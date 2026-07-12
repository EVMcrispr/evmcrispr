import { ErrorNotFound, encodeAction, Num } from "@evmcrispr/sdk";
import type { Address, PublicClient } from "viem";
import { parseAbiItem, zeroAddress } from "viem";
import type Swaps from "../..";
import type { V2Deployment } from "../../addresses";
import { WRAPPED_NATIVE } from "../../addresses";
import type {
  Quote,
  QuoteRequest,
  SwapPlan,
  SwapRequest,
  VenueAdapter,
} from "../types";

const getPairAbi = parseAbiItem(
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
);
const getAmountsOutAbi = parseAbiItem(
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
);
const getAmountsInAbi = parseAbiItem(
  "function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[] amounts)",
);

interface ResolvedRoute {
  path: Address[];
  deployment: V2Deployment;
  wrapped: Address;
}

async function requireDeployment(
  client: PublicClient,
  venueName: string,
  deployments: Record<number, V2Deployment>,
  chainId: number,
): Promise<V2Deployment> {
  const deployment = deployments[chainId];
  if (!deployment) {
    throw new ErrorNotFound(`${venueName} is not deployed on chain ${chainId}`);
  }
  const code = await client.getCode({ address: deployment.router });
  if (!code || code === "0x") {
    throw new ErrorNotFound(
      `${venueName} router ${deployment.router} has no code on chain ${chainId}`,
    );
  }
  return deployment;
}

async function pairExists(
  client: PublicClient,
  factory: Address,
  a: Address,
  b: Address,
): Promise<boolean> {
  const pair = await client.readContract({
    address: factory,
    abi: [getPairAbi],
    functionName: "getPair",
    args: [a, b],
  });
  return pair !== zeroAddress;
}

/** Direct pair if it exists, else a hop through the wrapped native token. */
async function findPath(
  client: PublicClient,
  venueName: string,
  deployment: V2Deployment,
  wrapped: Address | undefined,
  tokenIn: Address,
  tokenOut: Address,
): Promise<Address[]> {
  const { factory } = deployment;
  if (await pairExists(client, factory, tokenIn, tokenOut)) {
    return [tokenIn, tokenOut];
  }
  if (
    wrapped &&
    tokenIn !== wrapped &&
    tokenOut !== wrapped &&
    (await pairExists(client, factory, tokenIn, wrapped)) &&
    (await pairExists(client, factory, wrapped, tokenOut))
  ) {
    return [tokenIn, wrapped, tokenOut];
  }
  throw new ErrorNotFound(
    `${venueName} has no liquidity path from ${tokenIn} to ${tokenOut}`,
  );
}

async function resolveRoute(
  module: Swaps,
  venueName: string,
  deployments: Record<number, V2Deployment>,
  req: QuoteRequest,
): Promise<ResolvedRoute> {
  const client = await module.getClient();
  const deployment = await requireDeployment(
    client,
    venueName,
    deployments,
    req.chainId,
  );
  const wrapped = WRAPPED_NATIVE[req.chainId];
  if (
    !wrapped &&
    (req.tokenIn === zeroAddress || req.tokenOut === zeroAddress)
  ) {
    throw new ErrorNotFound(
      `no wrapped-native token known for chain ${req.chainId}`,
    );
  }
  const pathIn = req.tokenIn === zeroAddress ? wrapped : req.tokenIn;
  const pathOut = req.tokenOut === zeroAddress ? wrapped : req.tokenOut;
  const path = await findPath(
    client,
    venueName,
    deployment,
    wrapped,
    pathIn,
    pathOut,
  );
  return { path, deployment, wrapped };
}

async function quoteRoute(
  client: PublicClient,
  router: Address,
  path: Address[],
  req: QuoteRequest,
): Promise<Quote> {
  if (req.kind === "exactIn") {
    const amounts = await client.readContract({
      address: router,
      abi: [getAmountsOutAbi],
      functionName: "getAmountsOut",
      args: [req.amount, path],
    });
    return { amountIn: req.amount, amountOut: amounts[amounts.length - 1] };
  }
  const amounts = await client.readContract({
    address: router,
    abi: [getAmountsInAbi],
    functionName: "getAmountsIn",
    args: [req.amount, path],
  });
  return { amountIn: amounts[0], amountOut: req.amount };
}

function encodeSwap(
  router: Address,
  path: Address[],
  req: SwapRequest,
): SwapPlan {
  const nativeIn = req.tokenIn === zeroAddress;
  const nativeOut = req.tokenOut === zeroAddress;
  const pathParam = path as string[];
  const to = req.recipient;
  const deadline = Num.fromBigInt(req.deadline);

  if (req.kind === "exactIn") {
    const minOut = Num.fromBigInt(req.limit);
    const amountIn = Num.fromBigInt(req.amount);
    if (nativeIn) {
      return {
        actions: [
          encodeAction(
            router,
            "swapExactETHForTokens(uint256,address[],address,uint256)",
            [minOut, pathParam, to, deadline],
            { value: req.amount },
          ),
        ],
      };
    }
    const signature = nativeOut
      ? "swapExactTokensForETH(uint256,uint256,address[],address,uint256)"
      : "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)";
    return {
      approvalTarget: router,
      approvalAmount: req.amount,
      actions: [
        encodeAction(router, signature, [
          amountIn,
          minOut,
          pathParam,
          to,
          deadline,
        ]),
      ],
    };
  }

  const amountOut = Num.fromBigInt(req.amount);
  const maxIn = Num.fromBigInt(req.limit);
  if (nativeIn) {
    return {
      actions: [
        encodeAction(
          router,
          "swapETHForExactTokens(uint256,address[],address,uint256)",
          [amountOut, pathParam, to, deadline],
          { value: req.limit },
        ),
      ],
    };
  }
  const signature = nativeOut
    ? "swapTokensForExactETH(uint256,uint256,address[],address,uint256)"
    : "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)";
  return {
    approvalTarget: router,
    approvalAmount: req.limit,
    actions: [
      encodeAction(router, signature, [
        amountOut,
        maxIn,
        pathParam,
        to,
        deadline,
      ]),
    ],
  };
}

/** Build a VenueAdapter for a UniswapV2-style router/factory deployment. */
export function makeV2Venue(
  name: string,
  deployments: Record<number, V2Deployment>,
): VenueAdapter {
  return {
    name,
    kind: "onchain",
    supportsExactOut: true,
    supports: (chainId) => chainId in deployments,

    async quote(module, req) {
      const { path, deployment } = await resolveRoute(
        module,
        name,
        deployments,
        req,
      );
      const client = await module.getClient();
      const quote = await quoteRoute(client, deployment.router, path, req);
      return { ...quote, route: path };
    },

    async buildSwap(module, req) {
      const path =
        (req.quote?.route as Address[] | undefined) ??
        (await resolveRoute(module, name, deployments, req)).path;
      const deployment = deployments[req.chainId];
      return encodeSwap(deployment.router, path, req);
    },
  };
}
