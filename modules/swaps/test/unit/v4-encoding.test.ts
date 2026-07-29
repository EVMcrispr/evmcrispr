import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import type { Address } from "viem";
import {
  decodeAbiParameters,
  decodeFunctionData,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import { PERMIT2, UNISWAP_V4 } from "../../src/addresses";
import type { V4Route } from "../../src/venues/lib/v4";
import { buildV4Swap } from "../../src/venues/lib/v4";
import type { SwapRequest } from "../../src/venues/types";
import uniswapV4 from "../../src/venues/uniswap-v4";
import { OTHER_ADDRESS, SOME_ADDRESS } from "../fixtures";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
const permit2Abi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

const deployment = UNISWAP_V4[1];

// ETH (currency0 = zero) / USDC pool at the 0.05% tier.
const ethUsdcRoute: V4Route = {
  poolKey: {
    currency0: zeroAddress,
    currency1: USDC as Address,
    fee: 500,
    tickSpacing: 10,
    hooks: zeroAddress,
  },
  zeroForOne: true,
};

function baseRequest(overrides: Partial<SwapRequest>): SwapRequest {
  return {
    chainId: 1,
    tokenIn: zeroAddress,
    tokenOut: USDC as Address,
    amount: 10n ** 18n,
    kind: "exactIn",
    from: SOME_ADDRESS as Address,
    limit: 1800_000000n,
    slippageBps: 50,
    recipient: SOME_ADDRESS as Address,
    deadline: 1234567890n,
    ...overrides,
  };
}

function decodeExecute(action: any) {
  expect(action.to).to.eq(deployment.universalRouter);
  const { functionName, args } = decodeFunctionData({
    abi: routerAbi,
    data: action.data,
  });
  expect(functionName).to.eq("execute");
  const [commands, inputs, deadline] = args as [
    `0x${string}`,
    `0x${string}`[],
    bigint,
  ];
  return { commands, inputs, deadline };
}

function decodeV4Input(input: `0x${string}`) {
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes actions, bytes[] params"),
    input,
  );
  return { actions, params };
}

describe("Swaps > venues > v4 encoding", () => {
  it("encodes a native exact-in swap as V4_SWAP with SETTLE_ALL and TAKE_ALL", () => {
    const plan = buildV4Swap(deployment, ethUsdcRoute, baseRequest({}));
    expect(plan.approvalTarget).to.be.undefined;
    expect((plan.actions[0] as any).value).to.eq(10n ** 18n);

    const { commands, inputs, deadline } = decodeExecute(plan.actions[0]);
    expect(commands).to.eq("0x10"); // V4_SWAP
    expect(deadline).to.eq(1234567890n);

    const { actions, params } = decodeV4Input(inputs[0]);
    expect(actions).to.eq("0x060c0f"); // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
    expect(params).to.have.length(3);

    const [swap] = decodeAbiParameters(
      parseAbiParameters(
        "((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)",
      ),
      params[0],
    ) as unknown as any[];
    expect(swap.poolKey.fee).to.eq(500);
    expect(swap.zeroForOne).to.be.true;
    expect(swap.amountIn).to.eq(10n ** 18n);
    expect(swap.amountOutMinimum).to.eq(1800_000000n);

    const [settleCurrency, settleMax] = decodeAbiParameters(
      parseAbiParameters("address currency, uint256 maxAmount"),
      params[1],
    );
    expect(settleCurrency).to.eq(zeroAddress);
    expect(settleMax).to.eq(10n ** 18n);

    const [takeCurrency, takeMin] = decodeAbiParameters(
      parseAbiParameters("address currency, uint256 minAmount"),
      params[2],
    );
    expect(takeCurrency).to.eq(USDC);
    expect(takeMin).to.eq(1800_000000n);
  });

  it("uses TAKE with the recipient when it differs from the sender", () => {
    const other = OTHER_ADDRESS as Address;
    const plan = buildV4Swap(
      deployment,
      ethUsdcRoute,
      baseRequest({ recipient: other }),
    );
    const { inputs } = decodeExecute(plan.actions[0]);
    const { actions, params } = decodeV4Input(inputs[0]);
    expect(actions).to.eq("0x060c0e"); // ... TAKE

    const [currency, recipient, amount] = decodeAbiParameters(
      parseAbiParameters("address currency, address recipient, uint256 amount"),
      params[2],
    );
    expect(currency).to.eq(USDC);
    expect((recipient as string).toLowerCase()).to.eq(other.toLowerCase());
    expect(amount).to.eq(0n); // open delta
  });

  it("appends a SWEEP refund for native exact-out swaps", () => {
    const plan = buildV4Swap(
      deployment,
      ethUsdcRoute,
      baseRequest({
        kind: "exactOut",
        amount: 1000_000000n,
        limit: 10n ** 18n,
      }),
    );
    expect((plan.actions[0] as any).value).to.eq(10n ** 18n); // maxIn

    const { commands, inputs } = decodeExecute(plan.actions[0]);
    expect(commands).to.eq("0x1004"); // V4_SWAP, SWEEP
    expect(inputs).to.have.length(2);

    const { actions } = decodeV4Input(inputs[0]);
    expect(actions).to.eq("0x080c0f"); // SWAP_EXACT_OUT_SINGLE, SETTLE_ALL, TAKE_ALL
  });

  it("prepends a Permit2 approval for ERC20 input via the adapter", async () => {
    const route: V4Route = {
      poolKey: {
        currency0: USDC as Address,
        currency1: WETH as Address,
        fee: 500,
        tickSpacing: 10,
        hooks: zeroAddress,
      },
      zeroForOne: true,
    };
    const plan = await uniswapV4.buildSwap(
      {} as any,
      baseRequest({
        tokenIn: USDC as Address,
        tokenOut: WETH as Address,
        amount: 1000_000000n,
        limit: 5n * 10n ** 17n,
        quote: { amountIn: 1000_000000n, amountOut: 6n * 10n ** 17n, route },
      }),
      { interpreters: {} as any },
    );

    expect(plan.approvalTarget).to.eq(PERMIT2);
    expect(plan.approvalAmount).to.eq(1000_000000n);
    expect(plan.actions).to.have.length(2);
    expect((plan.actions[0] as any).to).to.eq(PERMIT2);

    const { functionName, args } = decodeFunctionData({
      abi: permit2Abi,
      data: (plan.actions[0] as any).data,
    });
    expect(functionName).to.eq("approve");
    expect(args?.[0]).to.eq(USDC);
    expect((args?.[1] as string).toLowerCase()).to.eq(
      deployment.universalRouter.toLowerCase(),
    );
    expect(args?.[2]).to.eq(1000_000000n);
    expect(args?.[3]).to.eq(1234567890);
    expect((plan.actions[1] as any).value).to.be.undefined;
  });
});
