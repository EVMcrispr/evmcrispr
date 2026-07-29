import "../../setup";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import type { Address } from "viem";
import { decodeFunctionData, parseAbi } from "viem";
import { GNO, HONEYSWAP_ROUTER, WXDAI } from "../../fixtures";

const routerAbi = parseAbi([
  "function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[] amounts)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT_OUT = 10n ** 18n; // 1 GNO

async function quoteIn(
  router: Address,
  path: Address[],
  amountOut: bigint,
): Promise<bigint> {
  const amounts = await getPublicClient().readContract({
    address: router,
    abi: routerAbi,
    functionName: "getAmountsIn",
    args: [amountOut, path],
  });
  return amounts[0];
}

describeCommand("swap-to", {
  describeName:
    "Swaps > commands > swap-to <amountOut> <tokenOut> from <tokenIn>",
  module: "swaps",
  preamble: "load swaps",
  cases: [
    {
      name: "buys an exact output, approving and capping the input at quote plus slippage",
      script: `swaps:swap-to 1e18 ${GNO} from ${WXDAI} --using Honeyswap`,
      setup: () => quoteIn(HONEYSWAP_ROUTER, [WXDAI, GNO], AMOUNT_OUT),
      validate: (actions, _interpreter, quoted: bigint) => {
        const maxIn = (quoted * 10050n + 9999n) / 10000n;
        expect(actions).to.have.length(2);

        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: (actions[0] as any).data,
        });
        expect(approval.args).to.eql([HONEYSWAP_ROUTER, maxIn]);

        const { functionName, args } = decodeFunctionData({
          abi: routerAbi,
          data: (actions[1] as any).data,
        });
        expect(functionName).to.eq("swapTokensForExactTokens");
        expect(args?.[0]).to.eq(AMOUNT_OUT);
        expect(args?.[1]).to.eq(maxIn);
        expect(args?.[2]).to.eql([WXDAI, GNO]);
      },
    },
    {
      name: "lets an explicit --max override the slippage-derived cap",
      script: `swaps:swap-to 1e18 ${GNO} from ${WXDAI} --using Honeyswap --max 500e18`,
      validate: (actions) => {
        const { args } = decodeFunctionData({
          abi: routerAbi,
          data: (actions.at(-1) as any).data,
        });
        expect(args?.[1]).to.eq(500n * 10n ** 18n);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when the keyword `from` is missing",
      script: `swaps:swap-to 1e18 ${GNO} to ${WXDAI}`,
      error: 'expected keyword "from"',
    },
  ],
  docCases: [
    {
      description:
        "Buy exactly 1 GNO with WXDAI on Honeyswap (Gnosis), spending at most the quote plus 0.5%",
      code: "swaps:swap-to 1e18 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb from 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d --using Honeyswap",
    },
  ],
});
