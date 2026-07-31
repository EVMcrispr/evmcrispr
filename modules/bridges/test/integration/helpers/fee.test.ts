import "../../setup";
import { beforeEach } from "bun:test";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { DAI_MAINNET, USDC_MAINNET, ZERO_ADDRESS } from "../../fixtures";
import {
  ACROSS_MOCK_FEE_DIVISOR,
  acrossState,
} from "../../fixtures/msw-handlers";

const AMOUNT = 1000n * 10n ** 18n;

beforeEach(() => acrossState.reset());

describeHelper("@bridges:fee", {
  describeName: "Bridges > helpers > @bridges:fee",
  module: "bridges",
  preamble: "switch mainnet",
  // Doc examples are lifted verbatim into the generated markdown, so they
  // spell out addresses instead of interpolating fixtures.
  docCases: [
    {
      description: "Check what bridging 1000 DAI to Optimism costs",
      code: `load bridges

switch mainnet
print @bridges:fee(1000e18 0x6B175474E89094C44Da98b954EedeAC495271d0F optimism)`,
      preamble: "",
    },
    {
      description: "Bridge only when the relayer fee is under 5 DAI",
      code: `load bridges

switch mainnet
if @bool(@bridges:fee(1000e18 0x6B175474E89094C44Da98b954EedeAC495271d0F optimism) < 5e18) (
  bridges:bridge 1000e18 0x6B175474E89094C44Da98b954EedeAC495271d0F to optimism
)`,
      preamble: "",
    },
  ],
  cases: [
    {
      name: "is zero for a standard CCTP transfer",
      input: `@bridges:fee(100e6 ${USDC_MAINNET} base)`,
      expected: "0",
    },
    {
      name: "returns the Across relayer fee for a non-USDC token",
      input: `@bridges:fee(${AMOUNT} ${DAI_MAINNET} optimism)`,
      expected: (AMOUNT / ACROSS_MOCK_FEE_DIVISOR).toString(),
    },
    {
      name: "is zero for a canonical ETH deposit",
      input: `@bridges:fee(1e18 ${ZERO_ADDRESS} optimism)`,
      expected: "0",
    },
  ],
  errorCases: [
    {
      name: "rejects bridging to the current chain",
      input: `@bridges:fee(100e6 ${USDC_MAINNET} mainnet)`,
      error: "already on Ethereum",
    },
    {
      name: "rejects a zero amount",
      input: `@bridges:fee(0 ${USDC_MAINNET} base)`,
      error: "<amount> must be greater than zero",
    },
  ],
});
