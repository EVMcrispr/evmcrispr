import "../../setup";
import {
  expect,
  getPublicClient,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import type { Address } from "viem";
import { decodeFunctionData, parseAbi } from "viem";
import {
  GNO,
  HONEYSWAP_ROUTER,
  OTHER_ADDRESS,
  SOME_ADDRESS,
  SUSHISWAP_ROUTER,
  WXDAI,
  ZERO_ADDRESS,
} from "../../fixtures";
import { DELORA_DATA, DELORA_TARGET } from "../../fixtures/msw-handlers";

const routerAbi = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT = 100n * 10n ** 18n;

async function quoteOut(
  router: Address,
  path: Address[],
  amountIn: bigint,
): Promise<bigint> {
  const amounts = await getPublicClient().readContract({
    address: router,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [amountIn, path],
  });
  return amounts[amounts.length - 1];
}

function decodeSwap(action: any) {
  return decodeFunctionData({ abi: routerAbi, data: action.data });
}

describeCommand("swap", {
  describeName: "Swaps > commands > swap <amount> <tokenIn> to <tokenOut>",
  module: "swaps",
  preamble: "load swaps",
  cases: [
    {
      name: "swaps a token with auto-approve and default 0.5% slippage",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using Honeyswap`,
      setup: () => quoteOut(HONEYSWAP_ROUTER, [WXDAI, GNO], AMOUNT),
      validate: (actions, _interpreter, quoted: bigint) => {
        expect(actions).to.have.length(2);
        const [approve, swap] = actions as any[];

        expect(approve.to).to.eq(WXDAI);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([HONEYSWAP_ROUTER, AMOUNT]);

        expect(swap.to).to.eq(HONEYSWAP_ROUTER);
        const { functionName, args } = decodeSwap(swap);
        expect(functionName).to.eq("swapExactTokensForTokens");
        expect(args?.[0]).to.eq(AMOUNT);
        expect(args?.[1]).to.eq((quoted * 9950n) / 10000n);
        expect(args?.[2]).to.eql([WXDAI, GNO]);
        expect((args?.[3] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "swaps on SushiSwap when selected with --using",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using SushiSwap`,
      validate: (actions) => {
        expect((actions.at(-1) as any).to).to.eq(SUSHISWAP_ROUTER);
      },
    },
    {
      name: "defaults to the Delora aggregator when no venue is given",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO}`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, swap] = actions as any[];
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect((approval.args?.[0] as string).toLowerCase()).to.eq(
          DELORA_TARGET.toLowerCase(),
        );
        expect(swap.to).to.eq(DELORA_TARGET);
        expect(swap.data).to.eq(DELORA_DATA);
      },
    },
    {
      name: "lets an explicit --min override the slippage-derived bound",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using Honeyswap --min 1`,
      validate: (actions) => {
        const { args } = decodeSwap(actions.at(-1));
        expect(args?.[1]).to.eq(1n);
      },
    },
    {
      name: "applies a custom --slippage percentage to the quote",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using Honeyswap --slippage 1`,
      setup: () => quoteOut(HONEYSWAP_ROUTER, [WXDAI, GNO], AMOUNT),
      validate: (actions, _interpreter, quoted: bigint) => {
        const { args } = decodeSwap(actions.at(-1));
        expect(args?.[1]).to.eq((quoted * 9900n) / 10000n);
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using Honeyswap --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect((actions[0] as any).to).to.eq(HONEYSWAP_ROUTER);
      },
    },
    {
      name: "sends the output to --to when given",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using Honeyswap --to ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args } = decodeSwap(actions.at(-1));
        expect(args?.[3]).to.eq(SOME_ADDRESS);
      },
    },
    {
      name: "swaps the native token via the ETH router variant with no approve",
      script: `swaps:swap 1e18 ${ZERO_ADDRESS} to ${GNO} --using Honeyswap`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect(action.value).to.eq(10n ** 18n);
        const { functionName, args } = decodeSwap(action);
        expect(functionName).to.eq("swapExactETHForTokens");
        expect(args?.[1]).to.eql([WXDAI, GNO]);
      },
    },
    {
      name: "swaps into the native token via the ETH router variant",
      script: `swaps:swap 100e18 ${GNO} to ${ZERO_ADDRESS} --using Honeyswap`,
      validate: (actions) => {
        const { functionName, args } = decodeSwap(actions.at(-1));
        expect(functionName).to.eq("swapExactTokensForETH");
        expect(args?.[2]).to.eql([GNO, WXDAI]);
      },
    },
    {
      name: "executes end-to-end inside sim:fork against the fork state",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  swaps:wrap 200e18
  swaps:swap 100e18 ${WXDAI} to ${GNO} --using Honeyswap
)`,
      validate: () => {
        // Reaching this point means the wrap, approve, and swap all
        // executed on the fork without reverting.
      },
    },
  ],
  errorCases: [
    {
      name: "should fail with an unknown venue",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using QuantumSwap`,
      error: "must be one of",
    },
    {
      name: "should fail when the venue is not deployed on the chain",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using UniswapV3`,
      error: "UniswapV3 is not available on Gnosis",
    },
    {
      name: "should fail when both tokens are the same",
      script: `swaps:swap 100e18 ${WXDAI} to ${WXDAI}`,
      error: "same token",
    },
    {
      name: "should point native-to-wrapped swaps at swaps:wrap",
      script: `swaps:swap 1e18 ${ZERO_ADDRESS} to ${WXDAI}`,
      error: "use swaps:wrap",
    },
    {
      name: "should fail when the keyword `to` is missing",
      script: `swaps:swap 100e18 ${WXDAI} from ${GNO}`,
      error: 'expected keyword "to"',
    },
    {
      name: "should fail when no liquidity path exists",
      script: `swaps:swap 1e18 ${SOME_ADDRESS} to ${OTHER_ADDRESS} --using Honeyswap`,
      error: "no liquidity path",
    },
  ],
  docCases: [
    {
      description: "Swap 100 WXDAI for GNO on Honeyswap (Gnosis)",
      code: "swaps:swap 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d to 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb --using Honeyswap",
    },
    {
      description:
        "Swap using the chain default venue, capping slippage at 1% of the quote",
      code: "swaps:swap 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d to 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb --slippage 1",
    },
    {
      description: "Swap 1 xDAI (native) for GNO, protected by @swaps:quote",
      code: "swaps:swap 1e18 0x0000000000000000000000000000000000000000 to 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb --min @swaps:quote(1e18 0x0000000000000000000000000000000000000000 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb)",
    },
  ],
});
