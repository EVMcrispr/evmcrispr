import "../../setup";
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
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256)",
]);

const AMOUNT = 50n * 10n ** 18n;

function decodeWithdraw(action: any) {
  return decodeFunctionData({ abi: vaultAbi, data: action.data });
}

describeCommand("withdraw", {
  describeName: "Vault > commands > withdraw <assets|max> from <vault>",
  module: "vault",
  preamble: "load vault",
  cases: [
    {
      name: "withdraws an explicit amount to the connected account",
      script: `vault:withdraw 50e18 from ${SDAI}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(SDAI.toLowerCase());
        const { functionName, args = [] } = decodeWithdraw(action);
        expect(functionName).to.eq("withdraw");
        expect(args[0]).to.eq(AMOUNT);
        expect((args[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "sends the withdrawn assets to --to, burning the callers shares",
      script: `vault:withdraw 50e18 from ${SDAI} --to ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args = [] } = decodeWithdraw(actions[0]);
        expect((args[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should reject barewords other than `max`",
      script: `vault:withdraw everything from ${SDAI}`,
      error: "must be a number or the keyword `max`",
    },
    {
      name: "should fail `max` when there is nothing to withdraw",
      script: `vault:withdraw max from ${SDAI}`,
      error: "nothing to withdraw",
    },
    {
      name: "should reject the zero address as a vault",
      script: `vault:withdraw 50e18 from ${ZERO_ADDRESS}`,
      error: "native token has no vault",
    },
    {
      name: "should fail `max` on addresses that are not ERC-4626 vaults",
      script: `vault:withdraw max from ${SOME_ADDRESS}`,
      error: "does not look like an ERC-4626 vault",
    },
    {
      name: "should reject a wrong keyword",
      script: `vault:withdraw 50e18 of ${SDAI}`,
      error: 'expected keyword "from"',
    },
    {
      name: "should point to vault:request-redeem on ERC-7540 asynchronous vaults",
      script: `switch mainnet
vault:withdraw 100e6 from ${CENTRIFUGE_JTRSY_VAULT}`,
      error: "use vault:request-redeem",
    },
  ],
  docCases: [
    {
      description: "Withdraw 50 WXDAI worth of the sDAI position on Gnosis",
      code: "vault:withdraw 50e18 from 0xaf204776c7245bF4147c2612BF6e5972Ee483701",
    },
  ],
});
