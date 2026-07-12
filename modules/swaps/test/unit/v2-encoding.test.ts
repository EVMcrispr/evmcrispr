import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import type { Address } from "viem";
import { decodeFunctionData, parseAbi } from "viem";
import honeyswap from "../../src/venues/honeyswap";
import type { SwapRequest } from "../../src/venues/types";
import {
  GNO,
  HONEYSWAP_ROUTER,
  SOME_ADDRESS,
  WXDAI,
  ZERO_ADDRESS,
} from "../fixtures";

const routerAbi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

// buildSwap only touches the module when no quoted route is provided, so a
// bare stub suffices for pure encoding tests.
const stubModule = {} as any;

function baseRequest(overrides: Partial<SwapRequest>): SwapRequest {
  return {
    chainId: 100,
    tokenIn: WXDAI as Address,
    tokenOut: GNO as Address,
    amount: 100n,
    kind: "exactIn",
    from: SOME_ADDRESS as Address,
    limit: 95n,
    slippageBps: 50,
    recipient: SOME_ADDRESS as Address,
    deadline: 1234567890n,
    quote: {
      amountIn: 100n,
      amountOut: 97n,
      route: [WXDAI, GNO] as Address[],
    },
    ...overrides,
  };
}

describe("Swaps > venues > v2 encoding", () => {
  it("encodes exact-in token-to-token swaps", async () => {
    const plan = await honeyswap.buildSwap(stubModule, baseRequest({}), {
      interpreters: {} as any,
    });
    expect(plan.approvalTarget).to.eq(HONEYSWAP_ROUTER);
    expect(plan.approvalAmount).to.eq(100n);
    expect(plan.actions).to.have.length(1);
    expect(plan.actions[0]).to.not.have.property("value");

    const action = plan.actions[0] as { to: string; data: `0x${string}` };
    expect(action.to).to.eq(HONEYSWAP_ROUTER);
    const { functionName, args } = decodeFunctionData({
      abi: routerAbi,
      data: action.data,
    });
    expect(functionName).to.eq("swapExactTokensForTokens");
    expect(args).to.eql([100n, 95n, [WXDAI, GNO], SOME_ADDRESS, 1234567890n]);
  });

  it("encodes exact-out token-to-token swaps approving the max input", async () => {
    const plan = await honeyswap.buildSwap(
      stubModule,
      baseRequest({ kind: "exactOut", amount: 97n, limit: 105n }),
      { interpreters: {} as any },
    );
    expect(plan.approvalAmount).to.eq(105n);

    const { functionName, args } = decodeFunctionData({
      abi: routerAbi,
      data: (plan.actions[0] as any).data,
    });
    expect(functionName).to.eq("swapTokensForExactTokens");
    expect(args?.[0]).to.eq(97n);
    expect(args?.[1]).to.eq(105n);
  });

  it("encodes native-in swaps with value and no approval", async () => {
    const plan = await honeyswap.buildSwap(
      stubModule,
      baseRequest({
        tokenIn: ZERO_ADDRESS as Address,
        quote: { amountIn: 100n, amountOut: 97n, route: [WXDAI, GNO] },
      }),
      { interpreters: {} as any },
    );
    expect(plan.approvalTarget).to.be.undefined;
    expect((plan.actions[0] as any).value).to.eq(100n);

    const { functionName } = decodeFunctionData({
      abi: routerAbi,
      data: (plan.actions[0] as any).data,
    });
    expect(functionName).to.eq("swapExactETHForTokens");
  });

  it("encodes native-out swaps through the ETH variant", async () => {
    const plan = await honeyswap.buildSwap(
      stubModule,
      baseRequest({
        tokenIn: GNO as Address,
        tokenOut: ZERO_ADDRESS as Address,
        quote: { amountIn: 100n, amountOut: 97n, route: [GNO, WXDAI] },
      }),
      { interpreters: {} as any },
    );
    const { functionName } = decodeFunctionData({
      abi: routerAbi,
      data: (plan.actions[0] as any).data,
    });
    expect(functionName).to.eq("swapExactTokensForETH");
  });

  it("encodes exact-out native-in swaps sending the max input as value", async () => {
    const plan = await honeyswap.buildSwap(
      stubModule,
      baseRequest({
        kind: "exactOut",
        tokenIn: ZERO_ADDRESS as Address,
        amount: 97n,
        limit: 105n,
        quote: { amountIn: 100n, amountOut: 97n, route: [WXDAI, GNO] },
      }),
      { interpreters: {} as any },
    );
    expect((plan.actions[0] as any).value).to.eq(105n);
    const { functionName } = decodeFunctionData({
      abi: routerAbi,
      data: (plan.actions[0] as any).data,
    });
    expect(functionName).to.eq("swapETHForExactTokens");
  });
});
