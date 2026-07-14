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
  "function deposit(uint256 assets, address receiver, address controller) returns (uint256)",
  "function mint(uint256 shares, address receiver, address controller) returns (uint256)",
]);

const AMOUNT = 1000n * 10n ** 6n;

function decodeClaim(action: any) {
  return decodeFunctionData({ abi: vaultAbi, data: action.data });
}

/** Drop the wallet action the `switch mainnet` line emits. */
function txs(actions: Action[]): { to: string; data: `0x${string}` }[] {
  return actions.filter(isTransactionAction) as {
    to: string;
    data: `0x${string}`;
  }[];
}

describeCommand("claim-deposit", {
  describeName: "Vault > commands > claim-deposit <amount|max> from <vault>",
  module: "vault",
  preamble: "load vault",
  cases: [
    {
      name: "claims an exact amount of assets with the deposit overload",
      script: `switch mainnet
vault:claim-deposit 1000e6 from ${CENTRIFUGE_JTRSY_VAULT}`,
      validate: (actions) => {
        const acts = txs(actions);
        expect(acts).to.have.length(1);
        const action = acts[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          CENTRIFUGE_JTRSY_VAULT.toLowerCase(),
        );
        const { functionName, args } = decodeClaim(action);
        expect(functionName).to.eq("deposit");
        expect(args?.[0]).to.eq(AMOUNT);
        expect((args?.[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect((args?.[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "claims an exact amount of shares with the mint overload via --exact shares",
      script: `switch mainnet
vault:claim-deposit 1000e6 from ${CENTRIFUGE_JTRSY_VAULT} --exact shares`,
      validate: (actions) => {
        const { functionName, args } = decodeClaim(txs(actions)[0]);
        expect(functionName).to.eq("mint");
        expect(args?.[0]).to.eq(AMOUNT);
      },
    },
    {
      name: "sends the claimed shares to --to and claims for --controller",
      script: `switch mainnet
vault:claim-deposit 1000e6 from ${CENTRIFUGE_JTRSY_VAULT} --to ${SOME_ADDRESS} --controller ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args } = decodeClaim(txs(actions)[0]);
        expect((args?.[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect((args?.[2] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail `max` when there is nothing to claim",
      script: `switch mainnet
vault:claim-deposit max from ${CENTRIFUGE_JTRSY_VAULT}`,
      error: "nothing to claim",
    },
    {
      name: "should reject invalid --exact values",
      script: `vault:claim-deposit 1000e6 from ${SDAI} --exact everything`,
      error: "--exact must be `assets` or `shares`",
    },
    {
      name: "should reject a negative --request-id",
      script: `vault:claim-deposit 1000e6 from ${SDAI} --request-id -1`,
      error: "--request-id must not be negative",
    },
    {
      name: "should reject the zero address as a vault",
      script: `vault:claim-deposit 1000e6 from ${ZERO_ADDRESS}`,
      error: "native token has no vault",
    },
    {
      name: "should fail on synchronous ERC-4626 vaults",
      script: `vault:claim-deposit 1000e18 from ${SDAI}`,
      error: "is not an asynchronous-deposit vault",
    },
    {
      name: "should reject a wrong keyword",
      script: `vault:claim-deposit 1000e6 of ${CENTRIFUGE_JTRSY_VAULT}`,
      error: 'expected keyword "from"',
    },
  ],
  docCases: [
    {
      description:
        "Claim the shares of a fulfilled deposit request on the Centrifuge JTRSY vault",
      code: `load vault

switch mainnet
vault:claim-deposit 1000e6 from 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A --to @me`,
      preamble: "",
    },
  ],
});
