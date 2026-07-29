import "../../setup";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  CENTRIFUGE_JTRSY_VAULT,
  SDAI,
  SOME_ADDRESS,
  ZERO_ADDRESS,
} from "../../fixtures";

const vaultAbi = parseAbi([
  "function requestRedeem(uint256 shares, address controller, address owner) returns (uint256)",
]);

const SHARES = 100n * 10n ** 6n;

function decodeRequestRedeem(action: any) {
  return decodeFunctionData({ abi: vaultAbi, data: action.data });
}

/** Drop the wallet action the `switch mainnet` line emits. */
function txs(actions: Action[]): { to: string; data: `0x${string}` }[] {
  return actions.filter(isTransactionAction) as {
    to: string;
    data: `0x${string}`;
  }[];
}

describeCommand("request-redeem", {
  describeName: "Vault > commands > request-redeem <shares|max> of <vault>",
  module: "vault",
  preamble: "load vault",
  cases: [
    {
      name: "requests a redemption of an explicit amount of shares",
      script: `switch mainnet
vault:request-redeem 100e6 of ${CENTRIFUGE_JTRSY_VAULT}`,
      validate: (actions) => {
        const acts = txs(actions);
        expect(acts).to.have.length(1);
        const action = acts[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          CENTRIFUGE_JTRSY_VAULT.toLowerCase(),
        );
        const { functionName, args } = decodeRequestRedeem(action);
        expect(functionName).to.eq("requestRedeem");
        expect(args?.[0]).to.eq(SHARES);
        expect((args?.[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect((args?.[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "assigns the request to --controller when given",
      script: `switch mainnet
vault:request-redeem 100e6 of ${CENTRIFUGE_JTRSY_VAULT} --controller ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args } = decodeRequestRedeem(txs(actions)[0]);
        expect((args?.[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect((args?.[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should reject barewords other than `max`",
      script: `vault:request-redeem everything of ${SDAI}`,
      error: "must be a number or the keyword `max`",
    },
    {
      name: "should fail `max` when there is nothing to redeem",
      script: `switch mainnet
vault:request-redeem max of ${CENTRIFUGE_JTRSY_VAULT}`,
      error: "nothing to redeem",
    },
    {
      name: "should reject the zero address as a vault",
      script: `vault:request-redeem 100e6 of ${ZERO_ADDRESS}`,
      error: "native token has no vault",
    },
    {
      name: "should fail on synchronous ERC-4626 vaults",
      script: `vault:request-redeem 100e18 of ${SDAI}`,
      error: "is not an asynchronous-redeem vault",
    },
    {
      name: "should reject a wrong keyword",
      script: `vault:request-redeem 100e6 from ${CENTRIFUGE_JTRSY_VAULT}`,
      error: 'expected keyword "of"',
    },
  ],
  docCases: [
    {
      description:
        "Request a redemption of 100 JTRSY shares from the Centrifuge vault on Ethereum",
      code: `load vault

switch mainnet
vault:request-redeem 100e6 of 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A`,
      preamble: "",
    },
  ],
});
