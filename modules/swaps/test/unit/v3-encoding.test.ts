import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import type { Address } from "viem";
import { decodeFunctionData, encodePacked, parseAbi } from "viem";
import { UNISWAP_V3 } from "../../src/addresses";
import { buildV3Swap, type V3Route } from "../../src/venues/lib/v3";
import type { SwapRequest } from "../../src/venues/types";
import { SOME_ADDRESS, ZERO_ADDRESS } from "../fixtures";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
  "function exactOutput((bytes path, address recipient, uint256 amountOut, uint256 amountInMaximum) params) payable returns (uint256 amountIn)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function refundETH() payable",
]);

const deployment = UNISWAP_V3[1];
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002";

function baseRequest(overrides: Partial<SwapRequest>): SwapRequest {
  return {
    chainId: 1,
    tokenIn: USDC as Address,
    tokenOut: DAI as Address,
    amount: 1000n,
    kind: "exactIn",
    from: SOME_ADDRESS as Address,
    limit: 990n,
    slippageBps: 50,
    recipient: SOME_ADDRESS as Address,
    deadline: 1234567890n,
    ...overrides,
  };
}

function decodeMulticall(action: any) {
  expect(action.to).to.eq(deployment.router);
  const { functionName, args = [] } = decodeFunctionData({
    abi: routerAbi,
    data: action.data,
  });
  expect(functionName).to.eq("multicall");
  const [deadline, calls] = args as [bigint, `0x${string}`[]];
  return {
    deadline,
    calls: calls.map((data) => decodeFunctionData({ abi: routerAbi, data })),
  };
}

describe("Swaps > venues > v3 encoding", () => {
  it("wraps a single-hop exact-in swap in multicall(deadline, ...)", () => {
    const route: V3Route = { tokens: [USDC, DAI], fees: [100] };
    const plan = buildV3Swap(deployment, route, baseRequest({}));

    expect(plan.approvalTarget).to.eq(deployment.router);
    expect(plan.approvalAmount).to.eq(1000n);

    const { deadline, calls } = decodeMulticall(plan.actions[0]);
    expect(deadline).to.eq(1234567890n);
    expect(calls).to.have.length(1);
    expect(calls[0].functionName).to.eq("exactInputSingle");
    const params = calls[0].args?.[0] as any;
    expect(params.fee).to.eq(100);
    expect(params.recipient).to.eq(SOME_ADDRESS);
    expect(params.amountIn).to.eq(1000n);
    expect(params.amountOutMinimum).to.eq(990n);
  });

  it("encodes multi-hop exact-in swaps with a packed path", () => {
    const route: V3Route = { tokens: [USDC, WETH, DAI], fees: [500, 3000] };
    const plan = buildV3Swap(deployment, route, baseRequest({}));

    const { calls } = decodeMulticall(plan.actions[0]);
    expect(calls[0].functionName).to.eq("exactInput");
    const params = calls[0].args?.[0] as any;
    expect(params.path).to.eq(
      encodePacked(
        ["address", "uint24", "address", "uint24", "address"],
        [USDC, 500, WETH, 3000, DAI],
      ),
    );
  });

  it("encodes multi-hop exact-out swaps with the path reversed", () => {
    const route: V3Route = { tokens: [USDC, WETH, DAI], fees: [500, 3000] };
    const plan = buildV3Swap(
      deployment,
      route,
      baseRequest({ kind: "exactOut", amount: 1000n, limit: 1010n }),
    );

    expect(plan.approvalAmount).to.eq(1010n);
    const { calls } = decodeMulticall(plan.actions[0]);
    expect(calls[0].functionName).to.eq("exactOutput");
    const params = calls[0].args?.[0] as any;
    expect(params.path).to.eq(
      encodePacked(
        ["address", "uint24", "address", "uint24", "address"],
        [DAI, 3000, WETH, 500, USDC],
      ),
    );
  });

  it("routes native output through the router and unwrapWETH9", () => {
    const route: V3Route = { tokens: [USDC, WETH], fees: [500] };
    const plan = buildV3Swap(
      deployment,
      route,
      baseRequest({ tokenOut: ZERO_ADDRESS as Address }),
    );

    const { calls } = decodeMulticall(plan.actions[0]);
    expect(calls).to.have.length(2);
    const params = calls[0].args?.[0] as any;
    expect(params.recipient).to.eq(ADDRESS_THIS);
    expect(calls[1].functionName).to.eq("unwrapWETH9");
    expect(calls[1].args).to.eql([990n, SOME_ADDRESS]);
  });

  it("sends value and refunds ETH on exact-out native-in swaps", () => {
    const route: V3Route = { tokens: [WETH, USDC], fees: [500] };
    const plan = buildV3Swap(
      deployment,
      route,
      baseRequest({
        tokenIn: ZERO_ADDRESS as Address,
        tokenOut: USDC as Address,
        kind: "exactOut",
        amount: 1000n,
        limit: 1010n,
      }),
    );

    expect(plan.approvalTarget).to.be.undefined;
    expect((plan.actions[0] as any).value).to.eq(1010n);
    const { calls } = decodeMulticall(plan.actions[0]);
    expect(calls[0].functionName).to.eq("exactOutputSingle");
    expect(calls[1].functionName).to.eq("refundETH");
  });
});
