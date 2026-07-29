import "../../setup";
import { beforeEach } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  ACROSS_SPOKE_MAINNET,
  DAI_MAINNET,
  USDC_MAINNET,
  ZERO_ADDRESS,
} from "../../fixtures";
import {
  ACROSS_MOCK_FEE_DIVISOR,
  acrossState,
} from "../../fixtures/msw-handlers";

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const spokeAbi = parseAbi([
  "function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes message)",
]);

const AMOUNT = 1000n * 10n ** 18n; // 1000 DAI
const FEE = AMOUNT / ACROSS_MOCK_FEE_DIVISOR;
const DAI_OPTIMISM = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";

function txs(actions: Action[]) {
  return actions.filter(isTransactionAction) as {
    to: string;
    data: `0x${string}`;
  }[];
}

beforeEach(() => acrossState.reset());

describeCommand("bridge --using Across", {
  describeName: "Bridges > commands > bridge > Across",
  module: "bridges",
  preamble: "load bridges\nswitch mainnet",
  cases: [
    {
      name: "is the default adapter for a non-USDC ERC-20 and deposits into the SpokePool",
      script: `bridges:bridge ${AMOUNT} ${DAI_MAINNET} to optimism`,
      validate: (actions) => {
        const [approve, deposit] = txs(actions);
        expect(txs(actions)).to.have.length(2);

        expect(approve.to).to.eq(DAI_MAINNET);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([ACROSS_SPOKE_MAINNET, AMOUNT]);

        expect(deposit.to).to.eq(ACROSS_SPOKE_MAINNET);
        const call = decodeFunctionData({ abi: spokeAbi, data: deposit.data });
        const [
          ,
          ,
          inputToken,
          outputToken,
          inputAmount,
          outputAmount,
          destinationChainId,
        ] = call.args;
        expect(inputToken).to.eq(DAI_MAINNET);
        expect(outputToken).to.eq(DAI_OPTIMISM);
        expect(inputAmount).to.eq(AMOUNT);
        // The mock API keeps 1/1000 as the relayer fee.
        expect(outputAmount).to.eq(AMOUNT - FEE);
        expect(destinationChainId).to.eq(10n);

        // The quote came from the API with the right query.
        expect(acrossState.requests).to.have.length(1);
        expect(acrossState.requests[0]).to.include({
          originChainId: "1",
          destinationChainId: "10",
          amount: AMOUNT.toString(),
        });
      },
    },
    {
      name: "bridges USDC through Across when asked explicitly",
      script: `bridges:bridge 100e6 ${USDC_MAINNET} to base --using Across`,
      validate: (actions) => {
        const call = decodeFunctionData({
          abi: spokeAbi,
          data: txs(actions)[1].data,
        });
        expect(call.args[2]).to.eq(USDC_MAINNET);
        // Native USDC on Base.
        expect(call.args[3]).to.eq(
          "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        );
      },
    },
  ],
  errorCases: [
    {
      name: "aborts when the fee exceeds --max-fee",
      script: `bridges:bridge ${AMOUNT} ${DAI_MAINNET} to optimism --max-fee 1`,
      error: "--max-fee is 1",
    },
    {
      name: "refuses to bridge the native token",
      script: `bridges:bridge 1e18 ${ZERO_ADDRESS} to optimism --using Across`,
      error: "Across doesn't bridge",
    },
    {
      name: "rejects a lane Across does not serve",
      script: `bridges:bridge ${AMOUNT} ${DAI_MAINNET} to gnosis --using Across`,
      error: "Across doesn't bridge",
    },
  ],
});
