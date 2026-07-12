import "../../setup";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import type { Address } from "viem";
import { parseAbi } from "viem";
import { GNO, HONEYSWAP_ROUTER, WXDAI } from "../../fixtures";
import { DELORA_RATE } from "../../fixtures/msw-handlers";

const routerAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
]);

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

describeHelper("@swaps:quote", {
  module: "swaps",
  cases: [
    {
      name: "matches the router quote on an explicit venue",
      input: `@swaps:quote(100e18 ${WXDAI} ${GNO} Honeyswap)`,
      validate: async (result) => {
        const expected = await quoteOut(
          HONEYSWAP_ROUTER,
          [WXDAI, GNO],
          100n * 10n ** 18n,
        );
        expect(String(result)).to.eq(expected.toString());
      },
    },
    {
      name: "quotes the default venue (mocked Delora) when none is given",
      input: `@swaps:quote(100e18 ${WXDAI} ${GNO})`,
      validate: async (result) => {
        expect(String(result)).to.eq(
          (100n * 10n ** 18n * DELORA_RATE).toString(),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on venues missing from the chain",
      input: `@swaps:quote(100e18 ${WXDAI} ${GNO} UniswapV2)`,
      error: "UniswapV2 is not available on chain 100",
    },
  ],
  docCases: [
    {
      description: "Print the expected GNO output for 100 WXDAI (on Gnosis)",
      code: 'print "GNO out:" @swaps:quote(100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb)',
    },
  ],
});

describeHelper("@swaps:price", {
  module: "swaps",
  cases: [
    {
      name: "prices 1 whole tokenA in base units of tokenB",
      input: `@swaps:price(${WXDAI} ${GNO} Honeyswap)`,
      validate: async (result) => {
        const expected = await quoteOut(
          HONEYSWAP_ROUTER,
          [WXDAI, GNO],
          10n ** 18n,
        );
        expect(String(result)).to.eq(expected.toString());
      },
    },
  ],
  docCases: [
    {
      description: "Print the GNO price of 1 WXDAI (on Gnosis)",
      code: 'print "1 WXDAI in GNO:" @swaps:price(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb)',
    },
  ],
});
