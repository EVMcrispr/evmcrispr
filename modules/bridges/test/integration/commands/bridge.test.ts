import "../../setup";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  CCTP_TOKEN_MESSENGER,
  DAI_MAINNET,
  USDC_MAINNET,
  ZERO_ADDRESS,
} from "../../fixtures";

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const depositForBurnAbi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
]);

const AMOUNT = 100_000_000n; // 100 USDC
const RECIPIENT = "0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9";
const BASE_DOMAIN = 6;

/** Drop the wallet action the `switch mainnet` preamble emits. */
function txs(actions: Action[]): { to: string; data: `0x${string}` }[] {
  return actions.filter(isTransactionAction) as {
    to: string;
    data: `0x${string}`;
  }[];
}

describeCommand("bridge", {
  describeName: "Bridges > commands > bridge > CCTPv2",
  module: "bridges",
  preamble: "load bridges\nswitch mainnet",
  // Doc examples are lifted verbatim into the generated markdown, so they
  // spell out addresses instead of interpolating fixtures.
  docCases: [
    {
      description: "Bridge 100 USDC from Ethereum to Base over CCTP",
      code: `load bridges

switch mainnet
bridges:bridge 100e6 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 to base --using CCTPv2`,
      preamble: "",
    },
    {
      description: "Bridge 1000 DAI to Optimism, paying out to someone else",
      code: `load bridges

switch mainnet
bridges:bridge 1000e18 0x6B175474E89094C44Da98b954EedeAC495271d0F to optimism --receiver 0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9`,
      preamble: "",
    },
    {
      description: "Move 1 ETH to Optimism through the canonical bridge",
      code: `load bridges

switch mainnet
bridges:bridge 1e18 0x0000000000000000000000000000000000000000 to optimism --using NativeBridge`,
      preamble: "",
    },
  ],
  cases: [
    {
      name: "approves the TokenMessenger and burns USDC for the destination domain",
      script: `bridges:bridge ${AMOUNT} ${USDC_MAINNET} to base`,
      validate: (actions) => {
        const [approve, burn] = txs(actions);
        expect(txs(actions)).to.have.length(2);

        expect(approve.to).to.eq(USDC_MAINNET);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([CCTP_TOKEN_MESSENGER, AMOUNT]);

        expect(burn.to).to.eq(CCTP_TOKEN_MESSENGER);
        const call = decodeFunctionData({
          abi: depositForBurnAbi,
          data: burn.data,
        });
        const [
          amount,
          destinationDomain,
          mintRecipient,
          burnToken,
          destinationCaller,
          maxFee,
          minFinality,
        ] = call.args;
        expect(amount).to.eq(AMOUNT);
        expect(destinationDomain).to.eq(BASE_DOMAIN);
        // The connected test account, left-padded to bytes32.
        expect(mintRecipient).to.match(/^0x0{24}[0-9a-f]{40}$/i);
        expect(burnToken).to.eq(USDC_MAINNET);
        // Any caller may deliver the message.
        expect(destinationCaller).to.eq(`0x${"0".repeat(64)}`);
        expect(maxFee).to.eq(0n);
        expect(minFinality).to.eq(2000);
      },
    },
    {
      name: "sends to --receiver when given",
      script: `bridges:bridge ${AMOUNT} ${USDC_MAINNET} to base --receiver ${RECIPIENT}`,
      validate: (actions) => {
        const call = decodeFunctionData({
          abi: depositForBurnAbi,
          data: txs(actions)[1].data,
        });
        expect(call.args[2]).to.eq(
          `0x000000000000000000000000${RECIPIENT.slice(2)}`,
        );
      },
    },
    {
      name: "skips the approval with --no-approve true",
      script: `bridges:bridge ${AMOUNT} ${USDC_MAINNET} to base --no-approve true`,
      validate: (actions) => {
        expect(txs(actions)).to.have.length(1);
        expect(txs(actions)[0].to).to.eq(CCTP_TOKEN_MESSENGER);
      },
    },
    {
      name: "routes optimism through the CCTP domain map",
      script: `bridges:bridge ${AMOUNT} ${USDC_MAINNET} to optimism --using CCTPv2`,
      validate: (actions) => {
        const call = decodeFunctionData({
          abi: depositForBurnAbi,
          data: txs(actions)[1].data,
        });
        expect(call.args[1]).to.eq(2); // optimism domain
      },
    },
  ],
  errorCases: [
    {
      name: "rejects bridging to the current chain",
      script: `bridges:bridge ${AMOUNT} ${USDC_MAINNET} to mainnet`,
      error: "already on chain 1; there is nothing to bridge",
    },
    {
      name: "rejects a zero amount",
      script: `bridges:bridge 0 ${USDC_MAINNET} to base`,
      error: "<amount> must be greater than zero",
    },
    {
      name: "rejects CCTPv2 for a token that is not native USDC",
      script: `bridges:bridge 1e18 ${DAI_MAINNET} to base --using CCTPv2`,
      error: "CCTPv2 doesn't bridge",
    },
    {
      name: "rejects an unknown adapter",
      script: `bridges:bridge ${AMOUNT} ${USDC_MAINNET} to base --using Hop`,
      error:
        "--using must be one of CCTPv2, Across, NativeBridge, LayerZero, CCIP",
    },
    {
      name: "rejects an unknown chain",
      script: `bridges:bridge ${AMOUNT} ${USDC_MAINNET} to narnia`,
      error: "must be a chain id or a camelCase viem chain name",
    },
    {
      name: "rejects the native token on a CCTP lane",
      script: `bridges:bridge 1e18 ${ZERO_ADDRESS} to base --using CCTPv2`,
      error: "CCTPv2 doesn't bridge",
    },
  ],
});
